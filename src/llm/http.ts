import { API_CONSTANTS } from '../constants';

/** 统一的 LLM 调用错误,message 已本地化为中文提示 */
export class LLMError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

/** 拼接 baseUrl 与路径,处理末尾斜杠 */
export function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

interface ErrorBody {
  error?: { message?: string; type?: string };
  message?: string;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ErrorBody;
    return body.error?.message ?? body.message ?? '';
  } catch {
    return '';
  }
}

/**
 * 带超时与一次重试的 POST JSON 请求。
 * 重试条件:HTTP 429 / 5xx 或网络层错误。
 */
export async function postJson<T>(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= API_CONSTANTS.MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, API_CONSTANTS.RETRY_DELAY));
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), API_CONSTANTS.REQUEST_TIMEOUT);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await readErrorMessage(response);
        const retryable = response.status === 429 || response.status >= 500;
        const error = new LLMError(
          describeHttpError(response.status, detail),
          response.status,
        );
        if (retryable && attempt < API_CONSTANTS.MAX_RETRIES) {
          lastError = error;
          continue;
        }
        throw error;
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof LLMError) {
        throw error;
      }
      const isAbort = error instanceof Error && error.name === 'AbortError';
      const wrapped = new LLMError(
        isAbort
          ? `请求超时(${API_CONSTANTS.REQUEST_TIMEOUT / 1000} 秒),请检查网络或稍后重试`
          : `网络请求失败: ${error instanceof Error ? error.message : String(error)}`,
      );
      if (attempt < API_CONSTANTS.MAX_RETRIES) {
        lastError = wrapped;
        continue;
      }
      throw wrapped;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new LLMError('请求失败');
}

function describeHttpError(status: number, detail: string): string {
  const suffix = detail ? `: ${detail}` : '';
  switch (status) {
    case 400:
      return `请求参数错误(400)${suffix}`;
    case 401:
    case 403:
      return `API Key 认证失败(${status}),请检查 Key 是否正确${suffix}`;
    case 404:
      return `接口地址不存在(404),请检查 Base URL 与 API 格式是否匹配${suffix}`;
    case 429:
      return `请求过于频繁或额度不足(429)${suffix}`;
    default:
      if (status >= 500) {
        return `服务器错误(${status})${suffix}`;
      }
      return `HTTP 错误(${status})${suffix}`;
  }
}
