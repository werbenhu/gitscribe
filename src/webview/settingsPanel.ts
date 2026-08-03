import * as vscode from 'vscode';
import { generateId, ProviderStore } from '../config/providerStore';
import { CONTEXT_DEFAULTS, normalizeContextSize } from '../constants';
import { testConnection } from '../llm/client';
import type { ApiFormat, CommitLanguage, ModelConfig, Provider } from '../types';
import { getSettingsHtml } from './settingsHtml';

interface SaveProviderMessage {
  type: 'saveProvider';
  provider: {
    id: string | null;
    name: string;
    baseUrl: string;
    apiFormat: ApiFormat;
    models: ModelConfig[];
  };
  apiKey?: string;
}

interface TestConnectionMessage {
  type: 'testConnection';
  provider: { id: string | null; name: string; baseUrl: string; apiFormat: ApiFormat };
  model: string;
  apiKey?: string;
}

type WebviewMessage =
  | { type: 'ready' }
  | SaveProviderMessage
  | { type: 'deleteProvider'; id: string }
  | { type: 'setActive'; providerId: string; model: string }
  | { type: 'setLanguage'; language: CommitLanguage }
  | { type: 'saveSystemPrompt'; language: CommitLanguage; prompt: string }
  | { type: 'resetSystemPrompt'; language: CommitLanguage }
  | TestConnectionMessage;

/** 设置面板(单例):多供应商管理界面 */
export class SettingsPanel {
  private static current: SettingsPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  static show(store: ProviderStore): void {
    if (SettingsPanel.current) {
      SettingsPanel.current.panel.reveal(vscode.ViewColumn.One);
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'gitCommitScribeSettings',
      'Git Scribe 设置',
      vscode.ViewColumn.One,
      { enableScripts: true, retainContextWhenHidden: true },
    );
    SettingsPanel.current = new SettingsPanel(panel, store);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly store: ProviderStore,
  ) {
    this.panel = panel;
    this.panel.webview.html = getSettingsHtml(this.createNonce());

    this.panel.webview.onDidReceiveMessage(
      (message: WebviewMessage) => void this.handleMessage(message),
      null,
      this.disposables,
    );
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    try {
      switch (message.type) {
        case 'ready':
          await this.pushState();
          break;
        case 'saveProvider':
          await this.handleSave(message);
          break;
        case 'deleteProvider':
          await this.store.deleteProvider(message.id);
          await this.pushState();
          break;
        case 'setActive':
          await this.store.setActive(message.providerId, message.model);
          await this.pushState();
          break;
        case 'setLanguage':
          await this.store.setCommitLanguage(message.language);
          await this.pushState();
          break;
        case 'saveSystemPrompt':
          await this.store.setSystemPrompt(message.language, message.prompt);
          await this.pushState();
          await this.post({ type: 'promptResult', ok: true, message: 'System Prompt 已保存 ✓' });
          break;
        case 'resetSystemPrompt':
          await this.store.setSystemPrompt(message.language, null);
          await this.pushState();
          await this.post({ type: 'promptResult', ok: true, message: '已恢复默认 System Prompt ✓' });
          break;
        case 'testConnection':
          await this.handleTest(message);
          break;
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Git Scribe: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async handleSave(message: SaveProviderMessage): Promise<void> {
    const { name, baseUrl, apiFormat, models } = message.provider;
    if (!name.trim()) {
      await this.post({ type: 'saveResult', ok: false, error: '请填写名称' });
      return;
    }
    if (!/^https?:\/\//.test(baseUrl.trim())) {
      await this.post({ type: 'saveResult', ok: false, error: 'Base URL 必须以 http:// 或 https:// 开头' });
      return;
    }
    if (models.length === 0) {
      await this.post({ type: 'saveResult', ok: false, error: '请至少添加一个模型' });
      return;
    }
    for (const m of models) {
      if (!m.id?.trim()) {
        await this.post({ type: 'saveResult', ok: false, error: '模型 id 不能为空' });
        return;
      }
    }

    const id = message.provider.id ?? generateId();
    const provider: Provider = {
      id,
      name: name.trim(),
      baseUrl: baseUrl.trim(),
      apiFormat,
      models: models.map((m) => ({
        id: m.id.trim(),
        contextSize: normalizeContextSize(m.contextSize),
      })),
    };
    await this.store.saveProvider(provider, message.apiKey);
    await this.pushState();
    await this.post({ type: 'saveResult', ok: true, providerId: id });
  }

  private async handleTest(message: TestConnectionMessage): Promise<void> {
    const reply = async (ok: boolean, text: string) =>
      this.post({ type: 'testResult', ok, message: text });

    try {
      // 表单里没输 key 时,使用已保存的 key
      let apiKey = message.apiKey;
      if (!apiKey && message.provider.id) {
        apiKey = await this.store.getApiKey(message.provider.id);
      }
      if (!apiKey) {
        await reply(false, '请先填写 API Key');
        return;
      }
      await testConnection({
        provider: {
          id: message.provider.id ?? 'test',
          name: message.provider.name,
          baseUrl: message.provider.baseUrl,
          apiFormat: message.provider.apiFormat,
          models: [{ id: message.model, contextSize: CONTEXT_DEFAULTS.CONTEXT_SIZE }],
        },
        apiKey,
        model: message.model,
        language: this.store.getCommitLanguage(),
        contextSize: CONTEXT_DEFAULTS.CONTEXT_SIZE,
      });
      await reply(true, `连接成功 ✓(${message.model})`);
    } catch (error) {
      await reply(false, `连接失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async pushState(): Promise<void> {
    await this.post({ type: 'state', state: await this.store.getWebviewState() });
  }

  private async post(message: unknown): Promise<void> {
    await this.panel.webview.postMessage(message);
  }

  private createNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }

  dispose(): void {
    SettingsPanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      this.disposables.pop()?.dispose();
    }
  }
}
