import type { ApiFormat } from './types';

/** globalState 存储键 */
export const STORAGE_KEYS = {
  providers: 'gitCommitScribe.providers',
  activeProviderId: 'gitCommitScribe.activeProviderId',
  activeModel: 'gitCommitScribe.activeModel',
  commitLanguage: 'gitCommitScribe.commitLanguage',
  /** 自定义 system 提示词: Partial<Record<CommitLanguage, string>> */
  systemPrompts: 'gitCommitScribe.systemPrompts',
  /** 是否记录与 AI 的会话(调试用) */
  debugLlmLogEnabled: 'gitCommitScribe.debugLlmLogEnabled',
  /** 最近若干次 LLM 会话记录 */
  llmSessionLogs: 'gitCommitScribe.llmSessionLogs',
} as const;

/** 会话调试日志限制 */
export const SESSION_LOG_LIMITS = {
  /** 最多保留的会话条数 */
  MAX_SESSIONS: 20,
  /** 单条 message/response 最大字符,超出截断 */
  MAX_CONTENT_CHARS: 200_000,
} as const;

/** SecretStorage API Key 键前缀(后接供应商 id) */
export const SECRET_KEY_PREFIX = 'gitCommitScribe.apiKey.';

/** HTTP 请求常量 */
export const API_CONSTANTS = {
  /** 请求超时(毫秒) */
  REQUEST_TIMEOUT: 60_000,
  /** 429/5xx 最大重试次数 */
  MAX_RETRIES: 1,
  /** 重试前等待(毫秒) */
  RETRY_DELAY: 1_000,
  /** Anthropic API 版本头 */
  ANTHROPIC_VERSION: '2023-06-01',
  /**
   * 生成提交信息的 max_tokens。
   * 思考/推理模型会先占用大量 token,过小会导致只有 thinking、正文为空。
   */
  MAX_TOKENS: 8_192,
  /** 采样温度 */
  TEMPERATURE: 0.7,
} as const;

/** 是否为 DeepSeek 系模型(默认开 thinking,易把输出额度耗尽) */
export function isDeepSeekModel(model: string): boolean {
  return /deepseek/i.test(model);
}

/**
 * 模型上下文默认与换算。
 * contextSize 表示模型支持的上下文窗口(tokens),用于估算可送入的 diff 体积。
 */
export const CONTEXT_DEFAULTS = {
  /** 默认上下文 128k tokens(贴近常见模型;过大易触发 API context 超限) */
  CONTEXT_SIZE: 128_000,
  /** 允许配置的最小值 */
  MIN_CONTEXT_SIZE: 1_000,
  /** 允许配置的最大值 */
  MAX_CONTEXT_SIZE: 1_000_000_000,
  /**
   * 预留给 system prompt + 输出 + 协议开销的 token 数。
   * 剩余部分按 charsPerToken 换算成可塞入的 diff 字符预算。
   */
  RESERVED_TOKENS: 12_000,
  /** 粗略: 1 token ≈ 3 字符(中文/代码偏保守) */
  CHARS_PER_TOKEN: 3,
  /**
   * 只用估算可用窗口的一部分,给 tokenizer 误差与推理开销留余量。
   */
  SAFETY_RATIO: 0.7,
  /** 无论上下文多大都至少保留的 diff 字符预算 */
  MIN_DIFF_CHARS: 4_000,
} as const;

/** diff 处理限制(单文件硬上限;总预算由 contextSize 动态计算) */
export const DIFF_LIMITS = {
  /** 单文件 diff 最大行数 */
  MAX_FILE_DIFF_LINES: 5_000,
  /**
   * 总 diff 默认字符数(未读到用户配置时的回退值)。
   * 实际生成时优先用 contextSize 换算结果。
   */
  MAX_TOTAL_CHARS: 20_000,
  /** 单文件内容(字符)超过此值视为过大 */
  MAX_FILE_CHARS: 100_000,
  /**
   * 分批摘要的最大批次数。超出后剩余文件压成路径清单,避免费用爆炸。
   */
  MAX_SUMMARY_BATCHES: 8,
  /** 超出批次上限时,清单里每个文件保留的最大 diff 字符数 */
  OMITTED_FILE_SNIPPET_CHARS: 200,
  /**
   * 超预算时先让模型点名深挖的文件数上限(提示词约束)。
   * 实际仍以字符预算为准,点名过多时本地再截断。
   */
  MAX_FOCUS_FILES: 24,
} as const;

/**
 * 根据模型上下文(tokens)估算可用于 diff 的最大字符数。
 * 公式: max(MIN_DIFF_CHARS, (contextSize - RESERVED) * SAFETY_RATIO * CHARS_PER_TOKEN)
 */
export function maxDiffCharsFromContext(contextSize: number): number {
  const size = Number.isFinite(contextSize) ? contextSize : CONTEXT_DEFAULTS.CONTEXT_SIZE;
  const usableTokens = Math.max(0, size - CONTEXT_DEFAULTS.RESERVED_TOKENS);
  const safeTokens = usableTokens * CONTEXT_DEFAULTS.SAFETY_RATIO;
  const chars = Math.floor(safeTokens * CONTEXT_DEFAULTS.CHARS_PER_TOKEN);
  return Math.max(CONTEXT_DEFAULTS.MIN_DIFF_CHARS, chars);
}

/** 规范化用户输入的上下文大小 */
export function normalizeContextSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    return CONTEXT_DEFAULTS.CONTEXT_SIZE;
  }
  return Math.min(
    CONTEXT_DEFAULTS.MAX_CONTEXT_SIZE,
    Math.max(CONTEXT_DEFAULTS.MIN_CONTEXT_SIZE, Math.floor(n)),
  );
}

/** 跳过真实 diff、用占位文本代替的文件模式 */
export const IGNORED_FILE_PATTERNS: RegExp[] = [
  /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|composer\.lock|Gemfile\.lock|poetry\.lock|Cargo\.lock)$/i,
  /\.min\.(js|css)$/i,
  /(^|\/)(dist|out|build|vendor|node_modules)\//i,
  /\.(map|snap)$/i,
];

/** 二进制文件扩展名 */
export const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.svg',
  '.pdf', '.zip', '.tar', '.gz', '.rar', '.7z',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.woff', '.woff2', '.ttf', '.eot',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.jar', '.class', '.pyc', '.db', '.sqlite',
]);

/** API 格式下拉选项(webview 展示用):仅支持 3 种 */
export const API_FORMAT_OPTIONS: { value: ApiFormat; label: string }[] = [
  { value: 'openai-chat', label: 'OpenAI Chat Completions (/chat/completions)' },
  { value: 'openai-responses', label: 'OpenAI Responses (/responses)' },
  { value: 'anthropic', label: 'Anthropic Messages (/v1/messages)' },
];
