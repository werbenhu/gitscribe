import * as vscode from 'vscode';
import { SECRET_KEY_PREFIX, STORAGE_KEYS } from '../constants';
import { getDefaultSystemPrompt } from '../llm/prompt';
import type {
  AppState,
  CommitLanguage,
  Provider,
  ProviderView,
  ResolvedConfig,
  SystemPromptMap,
  WebviewState,
} from '../types';

/**
 * 供应商配置存储层:
 * - 供应商列表 / 激活项 / 语言 / 提示词 → context.globalState
 * - API Key → context.secrets(SecretStorage),键为 gitscribe.apiKey.<providerId>
 */
export class ProviderStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /* ------------------------- 基础读写 ------------------------- */

  getProviders(): Provider[] {
    return this.context.globalState.get<Provider[]>(STORAGE_KEYS.providers, []);
  }

  getActiveProviderId(): string | null {
    return this.context.globalState.get<string | null>(STORAGE_KEYS.activeProviderId, null);
  }

  getActiveModel(): string | null {
    return this.context.globalState.get<string | null>(STORAGE_KEYS.activeModel, null);
  }

  getCommitLanguage(): CommitLanguage {
    return this.context.globalState.get<CommitLanguage>(STORAGE_KEYS.commitLanguage, 'zh-CN');
  }

  async setCommitLanguage(language: CommitLanguage): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.commitLanguage, language);
  }

  getSystemPrompts(): SystemPromptMap {
    return this.context.globalState.get<SystemPromptMap>(STORAGE_KEYS.systemPrompts, {});
  }

  /** 读取某语言的自定义 system 提示词;未自定义时返回 null */
  getCustomSystemPrompt(language: CommitLanguage): string | null {
    const value = this.getSystemPrompts()[language];
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
  }

  /**
   * 保存某语言的自定义 system 提示词。
   * 传入空字符串 / null / undefined 表示清除自定义、恢复内置默认。
   */
  async setSystemPrompt(language: CommitLanguage, prompt: string | null | undefined): Promise<void> {
    const map = { ...this.getSystemPrompts() };
    const trimmed = prompt?.trim() ?? '';
    if (trimmed) {
      map[language] = trimmed;
    } else {
      delete map[language];
    }
    await this.context.globalState.update(STORAGE_KEYS.systemPrompts, map);
  }

  async getApiKey(providerId: string): Promise<string | undefined> {
    return this.context.secrets.get(SECRET_KEY_PREFIX + providerId);
  }

  async setApiKey(providerId: string, apiKey: string): Promise<void> {
    if (apiKey) {
      await this.context.secrets.store(SECRET_KEY_PREFIX + providerId, apiKey);
    } else {
      await this.context.secrets.delete(SECRET_KEY_PREFIX + providerId);
    }
  }

  /* ------------------------- 供应商 CRUD ------------------------- */

  /**
   * 保存供应商(新增或按 id 更新)。
   * apiKey 传入 undefined 表示不修改已保存的 key;空字符串表示清除。
   */
  async saveProvider(provider: Provider, apiKey?: string): Promise<void> {
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === provider.id);
    if (index >= 0) {
      providers[index] = provider;
    } else {
      providers.push(provider);
    }
    await this.context.globalState.update(STORAGE_KEYS.providers, providers);

    if (apiKey !== undefined) {
      await this.setApiKey(provider.id, apiKey);
    }

    // 新增的第一个供应商自动设为激活
    if (index < 0 && providers.length === 1) {
      const model = provider.models[0] ?? null;
      await this.setActive(provider.id, model);
    }
  }

  async deleteProvider(providerId: string): Promise<void> {
    const providers = this.getProviders().filter((p) => p.id !== providerId);
    await this.context.globalState.update(STORAGE_KEYS.providers, providers);
    await this.context.secrets.delete(SECRET_KEY_PREFIX + providerId);

    if (this.getActiveProviderId() === providerId) {
      const next = providers[0] ?? null;
      await this.setActive(next ? next.id : null, next ? next.models[0] ?? null : null);
    }
  }

  /** 设置当前使用的供应商与模型 */
  async setActive(providerId: string | null, model: string | null): Promise<void> {
    await this.context.globalState.update(STORAGE_KEYS.activeProviderId, providerId);
    await this.context.globalState.update(STORAGE_KEYS.activeModel, model);
  }

  /* ------------------------- 解析与视图 ------------------------- */

  /**
   * 解析出生成提交信息所需的完整配置。
   * 未配置完整时返回 null(由调用方引导用户去设置)。
   */
  async resolveActiveConfig(): Promise<ResolvedConfig | null> {
    const providerId = this.getActiveProviderId();
    const model = this.getActiveModel();
    if (!providerId || !model) {
      return null;
    }
    const provider = this.getProviders().find((p) => p.id === providerId);
    if (!provider || !provider.baseUrl) {
      return null;
    }
    const apiKey = await this.getApiKey(providerId);
    if (!apiKey) {
      return null;
    }
    const language = this.getCommitLanguage();
    return {
      provider,
      apiKey,
      model,
      language,
      systemPrompt: this.getCustomSystemPrompt(language),
    };
  }

  /** 生成 webview 用的状态快照 */
  async getWebviewState(): Promise<WebviewState> {
    const activeProviderId = this.getActiveProviderId();
    const providers: ProviderView[] = await Promise.all(
      this.getProviders().map(async (p) => ({
        ...p,
        hasApiKey: Boolean(await this.getApiKey(p.id)),
        isActive: p.id === activeProviderId,
      })),
    );
    const saved = this.getSystemPrompts();
    const languages: CommitLanguage[] = ['zh-CN', 'en-US'];
    const systemPrompts = {} as Record<CommitLanguage, string>;
    const systemPromptCustomized = {} as Record<CommitLanguage, boolean>;
    const defaultSystemPrompts = {} as Record<CommitLanguage, string>;
    for (const lang of languages) {
      const custom = saved[lang]?.trim() ?? '';
      defaultSystemPrompts[lang] = getDefaultSystemPrompt(lang);
      systemPromptCustomized[lang] = Boolean(custom);
      systemPrompts[lang] = custom || defaultSystemPrompts[lang];
    }
    return {
      providers,
      activeProviderId,
      activeModel: this.getActiveModel(),
      commitLanguage: this.getCommitLanguage(),
      systemPrompts,
      systemPromptCustomized,
      defaultSystemPrompts,
    };
  }

  /** 调试用:读取完整 AppState */
  getAppState(): AppState {
    return {
      providers: this.getProviders(),
      activeProviderId: this.getActiveProviderId(),
      activeModel: this.getActiveModel(),
      commitLanguage: this.getCommitLanguage(),
      systemPrompts: this.getSystemPrompts(),
    };
  }
}

/** 生成短随机 id */
export function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
