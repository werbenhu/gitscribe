import type { ApiFormat } from './types';

/** globalState 存储键 */
export const STORAGE_KEYS = {
  providers: 'gitscribe.providers',
  activeProviderId: 'gitscribe.activeProviderId',
  activeModel: 'gitscribe.activeModel',
  commitLanguage: 'gitscribe.commitLanguage',
  /** 自定义 system 提示词: Partial<Record<CommitLanguage, string>> */
  systemPrompts: 'gitscribe.systemPrompts',
} as const;

/** SecretStorage API Key 键前缀(后接供应商 id) */
export const SECRET_KEY_PREFIX = 'gitscribe.apiKey.';

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
  MAX_TOKENS: 2_048,
  /** 采样温度 */
  TEMPERATURE: 0.7,
} as const;

/** diff 处理限制 */
export const DIFF_LIMITS = {
  /** 单文件 diff 最大行数 */
  MAX_FILE_DIFF_LINES: 5_000,
  /** 总 diff 最大字符数 */
  MAX_TOTAL_CHARS: 20_000,
  /** 单文件内容(字符)超过此值视为过大 */
  MAX_FILE_CHARS: 100_000,
} as const;

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
