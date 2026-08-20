/**
 * Git Scribe 核心数据模型
 */

/** 供应商 API 格式 */
export type ApiFormat = 'openai-chat' | 'openai-responses' | 'anthropic';

/** 供应商下的单个模型配置 */
export interface ModelConfig {
  /** 模型 id,如 deepseek-v4-flash */
  id: string;
  /** 该模型上下文大小(tokens),默认 128k */
  contextSize: number;
}

/** 模型供应商配置(API Key 单独存 SecretStorage,不在此结构中) */
export interface Provider {
  /** 随机生成的唯一 id */
  id: string;
  /** 显示名称,如 "智谱 GLM" */
  name: string;
  /** API 基础地址,如 https://open.bigmodel.cn/api/paas/v4 */
  baseUrl: string;
  /** API 格式 */
  apiFormat: ApiFormat;
  /** 模型列表(含各自上下文大小) */
  models: ModelConfig[];
}

/** 提交信息语言 */
export type CommitLanguage = 'zh-CN' | 'en-US';

/** 按语言存储的自定义 system 提示词(缺省或空字符串表示使用内置默认) */
export type SystemPromptMap = Partial<Record<CommitLanguage, string>>;

/** 持久化到 globalState 的整体状态 */
export interface AppState {
  providers: Provider[];
  activeProviderId: string | null;
  /** 当前使用的模型 id(属于激活供应商的 models 之一) */
  activeModel: string | null;
  commitLanguage: CommitLanguage;
  systemPrompts: SystemPromptMap;
}

/** 提供给 webview 的供应商视图模型(附带 key 是否已保存的标志) */
export interface ProviderView extends Provider {
  hasApiKey: boolean;
  isActive: boolean;
}

/** 一次 LLM 往返(请求 + 响应) */
export interface LlmTurnLog {
  /** 阶段标签,如 generate / select / summarize:1/3 / merge */
  phase: string;
  messages: { role: string; content: string }[];
  response: string;
  error?: string;
  durationMs: number;
}

/** 一次「生成提交信息」完整会话(可含多回合) */
export interface LlmSessionLog {
  id: string;
  startedAt: number;
  model: string;
  providerName: string;
  ok: boolean;
  turns: LlmTurnLog[];
}

/** webview 状态快照 */
export interface WebviewState {
  providers: ProviderView[];
  activeProviderId: string | null;
  activeModel: string | null;
  commitLanguage: CommitLanguage;
  /** 各语言当前生效的 system 提示词(已用默认值回填) */
  systemPrompts: Record<CommitLanguage, string>;
  /** 各语言是否已保存过自定义提示词 */
  systemPromptCustomized: Record<CommitLanguage, boolean>;
  /** 各语言内置默认提示词(供「恢复默认」使用) */
  defaultSystemPrompts: Record<CommitLanguage, string>;
  /** 新增模型时的默认上下文大小 */
  defaultContextSize: number;
  /** 是否记录与 AI 的会话 */
  debugLlmLogEnabled: boolean;
  /** 最近会话记录(新→旧) */
  llmSessions: LlmSessionLog[];
}

/** 一次生成请求所需的完整解析后配置 */
export interface ResolvedConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  language: CommitLanguage;
  /** 自定义 system 提示词;空则使用内置默认 */
  systemPrompt?: string | null;
  /** 当前模型的上下文大小(tokens),用于估算 diff 预算 */
  contextSize: number;
}

/** Git 变更状态(vscode.git API 的 Status 数值子集) */
export enum ChangeStatus {
  INDEX_ADDED = 0,
  INDEX_MODIFIED = 1,
  INDEX_DELETED = 2,
  INDEX_RENAMED = 3,
  INDEX_COPIED = 4,
  MODIFIED = 5,
  DELETED = 6,
  UNTRACKED = 7,
}

/** 一个暂存文件变更 */
export interface GitChange {
  path: string;
  status: ChangeStatus;
  diff: string;
}

/* ------------------------------------------------------------------ */
/* vscode.git 内置扩展 API 最小类型声明                                  */
/* 参考: vscode 仓库 extensions/git/src/api/git.d.ts                   */
/* ------------------------------------------------------------------ */

export interface GitInputBox {
  value: string;
}

export interface GitChangeItem {
  uri: { path: string; fsPath: string; scheme: string };
  renameUri?: { path: string; fsPath: string; scheme: string };
  status: ChangeStatus;
}

export interface RepositoryState {
  indexChanges: GitChangeItem[];
  workingTreeChanges: GitChangeItem[];
  /** 较新 VS Code 版本才有;未提供时 untracked 可能已并入 workingTreeChanges */
  untrackedChanges?: GitChangeItem[];
}

export interface Repository {
  readonly state: RepositoryState;
  readonly inputBox: GitInputBox;
  /** 仓库根目录 */
  readonly rootUri: { path: string; fsPath: string; scheme: string };
  /** 将路径加入暂存区 */
  add(paths: string[]): Promise<void>;
  /** index(暂存区)与 HEAD 的变更列表 */
  diffIndexWithHEAD(): Promise<GitChangeItem[]>;
  /** 单个文件 index 与 HEAD 的 unified diff */
  diffIndexWithHEAD(path: string): Promise<string>;
  /** 读取某 ref 下的文件内容,如 show(':', path) 读暂存区 */
  show(ref: string, path: string): Promise<string>;
}

export interface GitAPI {
  readonly repositories: Repository[];
}

export interface GitExtensionExports {
  getAPI(version: 1): GitAPI;
}
