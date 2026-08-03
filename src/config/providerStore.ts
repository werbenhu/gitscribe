import * as vscode from 'vscode';
import {
  CONTEXT_DEFAULTS,
  normalizeContextSize,
  SECRET_KEY_PREFIX,
  STORAGE_KEYS,
} from '../constants';
import { getDefaultSystemPrompt } from '../llm/prompt';
import type {
  AppState,
  CommitLanguage,
  ModelConfig,
  Provider,
  ProviderView,
  ResolvedConfig,
  SystemPromptMap,
  WebviewState,
} from '../types';

/**
 * 供应商配置存储层:
 * - 供应商列表 / 激活项 / 语言 / 提示词 → context.globalState
 * - API Key → context.secrets(SecretStorage),键为 gitCommitScribe.apiKey.<providerId>
 *
 * 兼容旧数据: models 可能是 string[] ,读取时迁移为 ModelConfig[]。
 */
export class ProviderStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  /* ------------------------- 基础读写 ---------------------- */

  getProviders(): Provider[] {
    const raw = this.context.globalState.get<Provider[] | LegacyProvider[]>(STORAGE_KEYS.providers, []);
    return raw.map((p) => this.normalizeProvider(p));
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

  /* ------------------------- 供应商 CRUD ---------------------- */

  /**
   * 保存供应商(新增或按 id 更新)。
   * apiKey 传入 undefined 表示不修改已保存的 key;空字符串表示清除。
   *
   * 不会因为「添加模型 / 添加供应商」而切换当前使用项。
   * 仅在以下情况调整激活状态:
   * - 全局尚无激活供应商时,用该供应商的第一个模型作为默认
   * - 当前供应商的激活模型已被从列表移除时,回退到该供应商剩余模型的第一个
   */
  async saveProvider(provider: Provider, apiKey?: string): Promise<void> {
    const normalized = this.normalizeProvider(provider);
    const providers = this.getProviders();
    const index = providers.findIndex((p) => p.id === normalized.id);
    if (index >= 0) {
      providers[index] = normalized;
    } else {
      providers.push(normalized);
    }
    await this.context.globalState.update(STORAGE_KEYS.providers, providers);

    if (apiKey !== undefined) {
      await this.setApiKey(normalized.id, apiKey);
    }

    const activeProviderId = this.getActiveProviderId();
    const activeModel = this.getActiveModel();

    // 尚无任何当前选择时,才用第一个可用供应商/模型做默认
    if (!activeProviderId || !activeModel) {
      const fallback =
        providers.find((p) => p.id === activeProviderId && p.models.length > 0) ??
        providers.find((p) => p.models.length > 0) ??
        null;
      if (fallback) {
        const modelId =
          fallback.id === activeProviderId &&
          activeModel &&
          fallback.models.some((m) => m.id === activeModel)
            ? activeModel
            : fallback.models[0]?.id ?? null;
        if (!activeProviderId || !activeModel) {
          await this.setActive(fallback.id, modelId);
        }
      }
      return;
    }

    // 当前供应商的激活模型被删掉时,回退到剩余模型的第一个
    if (activeProviderId === normalized.id) {
      if (!normalized.models.some((m) => m.id === activeModel)) {
        await this.setActive(normalized.id, normalized.models[0]?.id ?? null);
      }
    }
  }

  async deleteProvider(providerId: string): Promise<void> {
    const providers = this.getProviders().filter((p) => p.id !== providerId);
    await this.context.globalState.update(STORAGE_KEYS.providers, providers);
    await this.context.secrets.delete(SECRET_KEY_PREFIX + providerId);

    // 删除当前供应商时,回切到列表中下一个有模型的供应商
    if (this.getActiveProviderId() === providerId) {
      const next = providers.find((p) => p.models.length > 0) ?? providers[0] ?? null;
      await this.setActive(next ? next.id : null, next ? next.models[0]?.id ?? null : null);
    }
  }

  /** 设置当前使用的供应商与模型;model 空字符串视为 null */
  async setActive(providerId: string | null, model: string | null): Promise<void> {
    const normalizedModel = model?.trim() ? model : null;
    await this.context.globalState.update(STORAGE_KEYS.activeProviderId, providerId);
    await this.context.globalState.update(STORAGE_KEYS.activeModel, normalizedModel);
  }

  /**
   * 解析出生成提交信息所需的完整配置。
   * 未配置完整时返回 null(由调用方引导用户去设置)。
   * 若已选供应商但未选模型,回退到该供应商模型列表的第一个。
   */
  async resolveActiveConfig(): Promise<ResolvedConfig | null> {
    let providerId = this.getActiveProviderId();
    let model = this.getActiveModel();

    const providers = this.getProviders();
    // 没有任何激活项时,尝试默认第一个有模型的供应商
    if (!providerId) {
      const first = providers.find((p) => p.models.length > 0);
      if (!first) {
        return null;
      }
      providerId = first.id;
      model = first.models[0]?.id ?? null;
      await this.setActive(providerId, model);
    }

    const provider = providers.find((p) => p.id === providerId);
    if (!provider || !provider.baseUrl) {
      return null;
    }

    let modelConfig = provider.models.find((m) => m.id === model);
    // 未选模型或模型已不在列表:默认第一个
    if (!modelConfig) {
      modelConfig = provider.models[0];
      model = modelConfig?.id ?? null;
      if (model) {
        await this.setActive(provider.id, model);
      }
    }
    if (!model || !modelConfig) {
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
      contextSize: normalizeContextSize(modelConfig.contextSize),
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
      defaultContextSize: CONTEXT_DEFAULTS.CONTEXT_SIZE,
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

  /* ------------------------- 兼容与规范化 ---------------------- */

  /** 将旧 string[] 模型列表迁移为 ModelConfig[] */
  private normalizeProvider(raw: Provider | LegacyProvider): Provider {
    const models = (raw.models ?? []).map((m) => this.normalizeModel(m));
    // 去重(同 id 保留后者)
    const map = new Map<string, ModelConfig>();
    for (const m of models) {
      map.set(m.id, m);
    }
    return {
      id: raw.id,
      name: raw.name,
      baseUrl: raw.baseUrl,
      apiFormat: raw.apiFormat,
      models: [...map.values()],
    };
  }

  private normalizeModel(raw: ModelConfig | string): ModelConfig {
    if (typeof raw === 'string') {
      return { id: raw, contextSize: CONTEXT_DEFAULTS.CONTEXT_SIZE };
    }
    return {
      id: String(raw.id ?? '').trim(),
      contextSize: normalizeContextSize(raw.contextSize ?? CONTEXT_DEFAULTS.CONTEXT_SIZE),
    };
  }
}

/** 旧版供应商(models 为 string[]) */
interface LegacyProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiFormat: Provider['apiFormat'];
  models: Array<string | ModelConfig>;
}

/** 生成短随机 id */
export function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}
