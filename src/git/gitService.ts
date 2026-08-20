import * as path from 'path';
import * as vscode from 'vscode';
import { BINARY_EXTENSIONS, DIFF_LIMITS, IGNORED_FILE_PATTERNS } from '../constants';
import type {
  GitAPI,
  GitChange,
  GitExtensionExports,
  Repository,
} from '../types';
import { ChangeStatus } from '../types';

/**
 * Git 服务:通过 VSCode 内置的 vscode.git 扩展 API 操作仓库,
 * 不 spawn 任何 git 进程。
 */
export class GitService {
  private git: GitAPI | undefined;

  constructor() {
    const gitExtension =
      vscode.extensions.getExtension<GitExtensionExports>('vscode.git');
    if (gitExtension) {
      if (gitExtension.isActive) {
        this.git = gitExtension.exports.getAPI(1);
      } else {
        void gitExtension.activate().then((exports) => {
          this.git = exports.getAPI(1);
        });
      }
    }
  }

  private getRepository(): Repository | undefined {
    return this.git?.repositories[0];
  }

  isGitRepository(): boolean {
    return Boolean(this.getRepository());
  }

  /** 是否存在暂存的变更 */
  async hasStagedChanges(): Promise<boolean> {
    const changes = await this.getStagedChanges();
    return changes.length > 0;
  }

  /**
   * 将工作区全部变更(含未跟踪文件)加入暂存区。
   * @returns 实际暂存的文件数;无可暂存项时返回 0
   */
  async stageAllChanges(): Promise<number> {
    const repository = this.getRepository();
    if (!repository) {
      return 0;
    }

    const paths = new Set<string>();
    for (const item of repository.state.workingTreeChanges) {
      paths.add(item.uri.fsPath);
    }
    for (const item of repository.state.untrackedChanges ?? []) {
      paths.add(item.uri.fsPath);
    }

    if (paths.size === 0) {
      return 0;
    }

    await repository.add([...paths]);
    return paths.size;
  }

  /**
   * 获取暂存区(index 与 HEAD)的变更列表,每个文件带真实 unified diff。
   * diffIndexWithHEAD 不可用时(如初次提交无 HEAD)回退到
   * state.indexChanges + repository.show() 构造全量 +/- diff。
   */
  async getStagedChanges(): Promise<GitChange[]> {
    const repository = this.getRepository();
    if (!repository) {
      return [];
    }

    let items;
    try {
      items = await repository.diffIndexWithHEAD();
    } catch {
      items = repository.state.indexChanges;
    }

    const changes: GitChange[] = [];
    for (const item of items) {
      // Windows 上 uri.path 形如 /e:/foo,git API 认的是 fsPath 或相对仓库根路径
      const displayPath = this.toRepoRelativePath(repository, item.uri.fsPath);
      const diff = await this.getFileDiff(
        repository,
        item.uri.fsPath,
        displayPath,
        item.status,
      );
      changes.push({ path: displayPath, status: item.status, diff });
    }
    return changes;
  }

  /** 仓库相对路径(正斜杠),便于提示词阅读;失败则回退 fsPath */
  private toRepoRelativePath(repository: Repository, fsPath: string): string {
    const root = repository.rootUri?.fsPath;
    if (!root) {
      return fsPath.replace(/\\/g, '/');
    }
    const rel = path.relative(root, fsPath);
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      return fsPath.replace(/\\/g, '/');
    }
    return rel.replace(/\\/g, '/');
  }

  /** 供 git API 尝试的路径候选:相对路径优先,其次 fsPath */
  private pathCandidates(repository: Repository, fsPath: string): string[] {
    const rel = this.toRepoRelativePath(repository, fsPath);
    const out: string[] = [];
    if (rel && rel !== fsPath.replace(/\\/g, '/')) {
      out.push(rel);
      out.push(rel.replace(/\//g, path.sep));
    }
    out.push(fsPath);
    // 去重保序
    return [...new Set(out)];
  }

  /** 获取单个文件的 diff,带二进制/锁文件/超大文件过滤与截断 */
  private async getFileDiff(
    repository: Repository,
    fsPath: string,
    displayPath: string,
    status: ChangeStatus,
  ): Promise<string> {
    if (this.isBinary(fsPath) || this.isBinary(displayPath)) {
      return '[二进制文件,已跳过]';
    }
    if (
      IGNORED_FILE_PATTERNS.some((p) => p.test(displayPath)) ||
      IGNORED_FILE_PATTERNS.some((p) => p.test(fsPath.replace(/\\/g, '/')))
    ) {
      return '[生成/锁文件,已跳过内容]';
    }

    const candidates = this.pathCandidates(repository, fsPath);
    let diff = '';
    let lastError: unknown;

    for (const candidate of candidates) {
      try {
        diff = await repository.diffIndexWithHEAD(candidate);
        if (diff && diff.trim()) {
          break;
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (!diff || !diff.trim()) {
      diff = await this.buildFallbackDiff(repository, candidates, status, lastError);
    }

    if (diff.length > DIFF_LIMITS.MAX_FILE_CHARS) {
      diff = diff.slice(0, DIFF_LIMITS.MAX_FILE_CHARS);
    }
    const lines = diff.split('\n');
    if (lines.length > DIFF_LIMITS.MAX_FILE_DIFF_LINES) {
      diff = lines.slice(0, DIFF_LIMITS.MAX_FILE_DIFF_LINES).join('\n') + '\n... (diff 已截断)';
    }
    return diff;
  }

  /** 回退 diff:新增文件全 +,删除文件全 -,其余尝试读暂存区内容 */
  private async buildFallbackDiff(
    repository: Repository,
    pathCandidates: string[],
    status: ChangeStatus,
    previousError?: unknown,
  ): Promise<string> {
    const tryShow = async (ref: string): Promise<string | null> => {
      for (const candidate of pathCandidates) {
        try {
          return await repository.show(ref, candidate);
        } catch {
          // try next
        }
      }
      return null;
    };

    try {
      if (
        status === ChangeStatus.INDEX_ADDED ||
        status === ChangeStatus.UNTRACKED
      ) {
        const content = await tryShow(':');
        if (content !== null) {
          return this.toLines(content, '+');
        }
      } else if (
        status === ChangeStatus.INDEX_DELETED ||
        status === ChangeStatus.DELETED
      ) {
        const content = await tryShow('HEAD');
        if (content !== null) {
          return this.toLines(content, '-');
        }
      } else {
        // 已修改:优先用暂存区全文作示意;再试工作区文件
        const staged = await tryShow(':');
        if (staged !== null) {
          return `[暂存区文件内容(未能取得 unified diff)]\n${this.toLines(staged, '+')}`;
        }
        for (const candidate of pathCandidates) {
          try {
            const uri = path.isAbsolute(candidate)
              ? vscode.Uri.file(candidate)
              : vscode.Uri.file(path.join(repository.rootUri.fsPath, candidate));
            const bytes = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(bytes).toString('utf8');
            return `[工作区文件内容(未能取得 unified diff)]\n${this.toLines(text, '+')}`;
          } catch {
            // try next
          }
        }
      }
    } catch {
      // fall through
    }

    const detail = previousError instanceof Error ? previousError.message : '';
    return detail
      ? `[无法读取文件内容: ${detail}]`
      : '[无法读取文件内容]';
  }

  private toLines(content: string, prefix: string): string {
    let text = content;
    if (text.length > DIFF_LIMITS.MAX_FILE_CHARS) {
      text = text.slice(0, DIFF_LIMITS.MAX_FILE_CHARS);
    }
    return text
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
  }

  private isBinary(filePath: string): boolean {
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  }

  /** 把生成的提交信息填入 SCM 输入框 */
  setCommitMessage(message: string): boolean {
    const repository = this.getRepository();
    if (!repository) {
      return false;
    }
    repository.inputBox.value = message;
    return true;
  }
}
