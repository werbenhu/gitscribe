import { API_CONSTANTS, isDeepSeekModel } from '../constants';
import { buildUrl, LLMError, postJson, postJsonStream, type TokenSink } from './http';
import type { ChatMessage } from './prompt';

interface ChatCompletionResponse {
  choices?: {
    message?: {
      content?: string | { type?: string; text?: string }[] | null;
      /** 部分推理模型把思考放这里,正文仍在 content */
      reasoning_content?: string | null;
    };
    finish_reason?: string;
  }[];
}

interface ChatStreamChunk {
  choices?: {
    delta?: { content?: string | null };
    finish_reason?: string | null;
  }[];
  error?: { message?: string };
}

/**
 * OpenAI Chat Completions 格式:
 * POST {baseUrl}/chat/completions
 * 传入 onToken 时启用 SSE 流式输出。
 */
export async function callOpenAIChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onToken?: TokenSink,
): Promise<string> {
  const url = baseUrl.replace(/\/+$/, '').endsWith('/chat/completions')
    ? baseUrl.replace(/\/+$/, '')
    : buildUrl(baseUrl, '/chat/completions');

  const body: Record<string, unknown> = {
    model,
    messages,
    max_tokens: API_CONSTANTS.MAX_TOKENS,
    temperature: API_CONSTANTS.TEMPERATURE,
    stream: Boolean(onToken),
  };
  // DeepSeek 官方默认开 thinking 且 effort=high(思考 10s+),提交信息场景关闭
  if (isDeepSeekModel(model)) {
    body.thinking = { type: 'disabled' };
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  if (onToken) {
    return streamChat(url, headers, body, model, onToken);
  }

  const data = await postJson<ChatCompletionResponse>(url, headers, body);

  const content = extractChatContent(data.choices?.[0]?.message?.content);
  if (!content) {
    const finish = data.choices?.[0]?.finish_reason;
    throw new LLMError(
      `模型返回为空,请检查模型名称是否正确(模型: ${model}` +
        (finish ? `, finish_reason: ${finish}` : '') +
        ')',
    );
  }
  return content;
}

async function streamChat(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  model: string,
  onToken: TokenSink,
): Promise<string> {
  let content = '';
  let finishReason = '';

  await postJsonStream(url, headers, body, (data) => {
    const chunk = JSON.parse(data) as ChatStreamChunk;
    if (chunk.error?.message) {
      throw new LLMError(chunk.error.message);
    }
    const choice = chunk.choices?.[0];
    if (choice?.finish_reason) {
      finishReason = choice.finish_reason;
    }
    const delta = choice?.delta?.content;
    if (typeof delta === 'string' && delta) {
      content += delta;
      onToken(delta);
    }
  });

  const text = content.trim();
  if (!text) {
    throw new LLMError(
      `模型返回为空,请检查模型名称是否正确(模型: ${model}` +
        (finishReason ? `, finish_reason: ${finishReason}` : '') +
        ')',
    );
  }
  return text;
}

function extractChatContent(
  content: string | { type?: string; text?: string }[] | null | undefined,
): string {
  if (typeof content === 'string') {
    return content.trim();
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part?.text === 'string' ? part.text : ''))
      .join('')
      .trim();
  }
  return '';
}
