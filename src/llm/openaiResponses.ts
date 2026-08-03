import { API_CONSTANTS } from '../constants';
import { buildUrl, LLMError, postJson } from './http';
import type { ChatMessage } from './prompt';

interface ResponsesAPIOutput {
  output_text?: string;
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
}

/**
 * OpenAI Responses API 格式:
 * POST {baseUrl}/responses
 * system 放到 instructions,user 放到 input。
 */
export async function callOpenAIResponses(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const url = baseUrl.replace(/\/+$/, '').endsWith('/responses')
    ? baseUrl.replace(/\/+$/, '')
    : buildUrl(baseUrl, '/responses');

  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const user = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n\n');

  const data = await postJson<ResponsesAPIOutput>(
    url,
    { Authorization: `Bearer ${apiKey}` },
    {
      model,
      instructions: system,
      input: user,
      max_output_tokens: API_CONSTANTS.MAX_TOKENS,
      temperature: API_CONSTANTS.TEMPERATURE,
    },
  );

  if (data.output_text) {
    return data.output_text;
  }
  // 兼容未提供 output_text 聚合字段的网关:遍历 output 数组
  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.text) {
        return part.text;
      }
    }
  }
  throw new LLMError('模型返回为空,请检查模型名称是否正确');
}
