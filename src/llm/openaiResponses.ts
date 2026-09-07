import { API_CONSTANTS, isDeepSeekModel } from '../constants';
import { buildUrl, LLMError, postJson, postJsonStream, type TokenSink } from './http';
import type { ChatMessage } from './prompt';

interface ResponsesAPIOutput {
  output_text?: string;
  output?: {
    type?: string;
    content?: { type?: string; text?: string }[];
  }[];
}

interface ResponsesStreamEvent {
  type?: string;
  delta?: string;
  error?: { message?: string };
  response?: { error?: { message?: string } };
}

/**
 * OpenAI Responses API 格式:
 * POST {baseUrl}/responses
 * system 放到 instructions,user 放到 input。
 * 传入 onToken 时启用 SSE 流式输出。
 */
export async function callOpenAIResponses(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  onToken?: TokenSink,
): Promise<string> {
  const url = baseUrl.replace(/\/+$/, '').endsWith('/responses')
    ? baseUrl.replace(/\/+$/, '')
    : buildUrl(baseUrl, '/responses');

  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const user = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n\n');

  const body: Record<string, unknown> = {
    model,
    instructions: system,
    input: user,
    max_output_tokens: API_CONSTANTS.MAX_TOKENS,
    temperature: API_CONSTANTS.TEMPERATURE,
    stream: Boolean(onToken),
  };
  if (isDeepSeekModel(model)) {
    // DeepSeek 默认开 thinking(effort=high),提交场景关闭;
    // 双写两种风格参数,兼容只认其中一种的网关
    body.reasoning = { effort: 'none' };
    body.thinking = { type: 'disabled' };
  }

  const headers = { Authorization: `Bearer ${apiKey}` };

  if (onToken) {
    return streamResponses(url, headers, body, onToken);
  }

  const data = await postJson<ResponsesAPIOutput>(url, headers, body);

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

async function streamResponses(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  onToken: TokenSink,
): Promise<string> {
  let content = '';

  await postJsonStream(url, headers, body, (data) => {
    const event = JSON.parse(data) as ResponsesStreamEvent;
    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string') {
      content += event.delta;
      onToken(event.delta);
      return;
    }
    if (event.type === 'response.failed' || event.type === 'error') {
      const message =
        event.error?.message ?? event.response?.error?.message ?? '未知错误';
      throw new LLMError(`流式生成失败: ${message}`);
    }
  });

  const text = content.trim();
  if (!text) {
    throw new LLMError('模型返回为空,请检查模型名称是否正确');
  }
  return text;
}
