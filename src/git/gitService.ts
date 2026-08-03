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
      const filePath = item.uri.path;
      const diff = await this.getFileDiff(repository, filePath, item.status);
      changes.push({ path: filePath, status: item.status, diff });
    }
    return changes;
  }

  /** 获取单个文件的 diff,带二进制/锁文件/超大文件过滤与截断 */
  private async getFileDiff(
    repository: Repository,
    filePath: string,
    status: ChangeStatus,
  ): Promise<string> {
    if (this.isBinary(filePath)) {
      return '[二进制文件,已跳过]';
    }
    if (IGNORED_FILE_PATTERNS.some((p) => p.test(filePath))) {
      return '[生成/锁文件,已跳过内容]';
    }

    let diff: string;
    try {
      diff = await repository.diffIndexWithHEAD(filePath);
    } catch {
      // 无 HEAD(初次提交)等场景:用暂存区内容构造全 + diff
      diff = await this.buildFallbackDiff(repository, filePath, status);
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

  /** 回退 diff:新增文件全 +,删除文件全 -,其余标记状态 */
  private async buildFallbackDiff(
    repository: Repository,
    filePath: string,
    status: ChangeStatus,
  ): Promise<string> {
    try {
      if (
        status === ChangeStatus.INDEX_ADDED ||
        status === ChangeStatus.UNTRACKED
      ) {
        const content = await repository.show(':', filePath);
        return this.toLines(content, '+');
      }
      if (status === ChangeStatus.INDEX_DELETED || status === ChangeStatus.DELETED) {
        const content = await repository.show('HEAD', filePath);
        return this.toLines(content, '-');
      }
      const content = await repository.show(':', filePath);
      return `[文件内容]\n${this.toLines(content, '+')}`;
    } catch {
      return '[无法读取文件内容]';
    }
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
