import { API_CONSTANTS } from '../constants';
import { buildUrl, LLMError, postJson } from './http';
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

/**
 * OpenAI Chat Completions 格式:
 * POST {baseUrl}/chat/completions
 */
export async function callOpenAIChat(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const url = baseUrl.replace(/\/+$/, '').endsWith('/chat/completions')
    ? baseUrl.replace(/\/+$/, '')
    : buildUrl(baseUrl, '/chat/completions');

  const data = await postJson<ChatCompletionResponse>(
    url,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      messages,
      max_tokens: API_CONSTANTS.MAX_TOKENS,
      temperature: API_CONSTANTS.TEMPERATURE,
      stream: false,
    },
  );

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
