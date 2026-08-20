import * as vscode from 'vscode';
import { generateId, ProviderStore } from './config/providerStore';
import { GitService } from './git/gitService';
import { generateCommitMessage } from './llm/client';
import { SessionLogBuilder } from './llm/sessionLog';
import { SettingsPanel } from './webview/settingsPanel';

let store: ProviderStore;
let gitService: GitService;

export function activate(context: vscode.ExtensionContext): void {
  store = new ProviderStore(context);
  gitService = new GitService();

  context.subscriptions.push(
    vscode.commands.registerCommand('gitCommitScribe.generate', () => generateCommand()),
    vscode.commands.registerCommand('gitCommitScribe.openSettings', () =>
      SettingsPanel.show(store),
    ),
  );
}

export function deactivate(): void {
  // 无长驻资源需要清理
}

/** 「生成提交信息」命令主流程 */
async function generateCommand(): Promise<void> {
  // 1. 校验配置
  const config = await store.resolveActiveConfig();
  if (!config) {
    const choice = await vscode.window.showWarningMessage(
      'Git Scribe: 尚未配置可用的模型供应商(需要供应商、模型与 API Key)。',
      '去配置',
    );
    if (choice === '去配置') {
      SettingsPanel.show(store);
    }
    return;
  }

  // 2. 校验 Git 仓库
  if (!gitService.isGitRepository()) {
    vscode.window.showErrorMessage('Git Scribe: 当前工作区没有 Git 仓库。');
    return;
  }

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.SourceControl,
      title: 'Git Scribe',
      cancellable: false,
    },
    async (progress) => {
      const session = store.isDebugLlmLogEnabled()
        ? new SessionLogBuilder(config.model, config.provider.name)
        : null;

      try {
        progress.report({ message: '正在准备变更…' });

        // 3. 获取暂存区变更;为空则先暂存工作区全部改动
        let changes = await gitService.getStagedChanges();
        if (changes.length === 0) {
          const stagedCount = await gitService.stageAllChanges();
          if (stagedCount === 0) {
            vscode.window.showWarningMessage('Git Scribe: 没有可提交的变更。');
            return;
          }
          changes = await gitService.getStagedChanges();
          if (changes.length === 0) {
            vscode.window.showWarningMessage('Git Scribe: 暂存后仍无变更,请检查 Git 状态。');
            return;
          }
        }

        // 4. 调用 LLM 生成(超预算时自动分批摘要再合并)
        const message = await generateCommitMessage(
          changes,
          config,
          (phase) => {
            progress.report({ message: phase });
          },
          session,
        );

        if (session) {
          await store.appendLlmSession(session.finish(true, generateId()));
          SettingsPanel.refreshIfOpen();
        }

        // 5. 填入 SCM 输入框
        if (gitService.setCommitMessage(message)) {
          const tip = session
            ? '$(check) Git Scribe: 提交信息已填入(会话已记录)'
            : '$(check) Git Scribe: 提交信息已填入 Git 面板';
          vscode.window.setStatusBarMessage(tip, 5000);
        } else {
          vscode.window.showErrorMessage('Git Scribe: 无法访问 Git 仓库输入框。');
        }
      } catch (error) {
        if (session) {
          try {
            await store.appendLlmSession(session.finish(false, generateId()));
            SettingsPanel.refreshIfOpen();
          } catch {
            // 日志写入失败不影响错误提示
          }
        }
        vscode.window.showErrorMessage(
          `Git Scribe 生成失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  );
}
