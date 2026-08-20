import { API_CONSTANTS, isDeepSeekModel } from '../constants';
import { LLMError, postJson } from './http';
import type { ChatMessage } from './prompt';

interface AnthropicContentPart {
  type?: string;
  text?: string;
  /** 部分兼容实现把正文直接放在 thinking 外的其他字段 */
  thinking?: string;
}

interface AnthropicMessagesResponse {
  content?: AnthropicContentPart[] | string;
  stop_reason?: string;
  error?: { message?: string; type?: string };
}

/**
 * Anthropic Messages 格式:
 * POST {baseUrl}/v1/messages(baseUrl 已以 /v1 结尾时补 /messages)
 *
 * 兼容 DeepSeek 等网关:可能返回 thinking 块 + text 块;思考模型易把 max_tokens 耗尽。
 */
export async function callAnthropic(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
): Promise<string> {
  const base = baseUrl.replace(/\/+$/, '');
  const url = base.endsWith('/v1') ? `${base}/messages` : `${base}/v1/messages`;

  const system = messages.find((m) => m.role === 'system')?.content ?? '';
  const chatMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role, content: m.content }));

  // DeepSeek Anthropic 兼容口默认开 thinking,易占满 max_tokens;提交生成关闭思考
  const body: Record<string, unknown> = {
    model,
    max_tokens: API_CONSTANTS.MAX_TOKENS,
    temperature: API_CONSTANTS.TEMPERATURE,
    system,
    messages: chatMessages,
  };
  if (isDeepSeekModel(model)) {
    // DeepSeek Anthropic 文档: reasoning.effort=none 关闭 thinking
    body.reasoning = { effort: 'none' };
  }

  const data = await postJson<AnthropicMessagesResponse>(
    url,
    {
      'x-api-key': apiKey,
      'anthropic-version': API_CONSTANTS.ANTHROPIC_VERSION,
      // 部分兼容网关同时认 Bearer
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  );

  const text = extractAnthropicText(data);
  if (!text) {
    throw new LLMError(describeEmptyAnthropic(data, model));
  }
  return text;
}

/** 从 Anthropic 风格响应中提取最终可见文本 */
function extractAnthropicText(data: AnthropicMessagesResponse): string {
  const content = data.content;
  if (typeof content === 'string') {
    return content.trim();
  }
  if (!Array.isArray(content)) {
    return '';
  }

  // 优先拼接 type=text 的块;兼容省略 type 但带 text 的网关
  const texts: string[] = [];
  for (const part of content) {
    if (!part || typeof part !== 'object') {
      continue;
    }
    if (part.type === 'thinking' || part.type === 'redacted_thinking') {
      continue;
    }
    if (typeof part.text === 'string' && part.text.trim()) {
      texts.push(part.text);
    }
  }
  return texts.join('\n').trim();
}

function describeEmptyAnthropic(data: AnthropicMessagesResponse, model: string): string {
  const content = data.content;
  const types = Array.isArray(content)
    ? content.map((p) => p?.type || typeof p).filter(Boolean).join(', ')
    : typeof content;

  if (data.stop_reason === 'max_tokens') {
    return (
      `模型输出被 max_tokens 截断且没有正文(模型: ${model})。` +
      `思考类模型常把额度用在推理上,请换非推理模型或提高 max_tokens。` +
      (types ? ` content 类型: ${types}` : '')
    );
  }

  if (Array.isArray(content) && content.some((p) => p?.type === 'thinking')) {
    return (
      `模型只返回了思考内容、没有提交信息正文(模型: ${model})。` +
      `请改用非推理模型,或确认该模型在 Anthropic 兼容接口下会输出 text 块。`
    );
  }

  return (
    `模型返回为空,请检查模型名称与 API 格式是否正确(模型: ${model}` +
    (data.stop_reason ? `, stop_reason: ${data.stop_reason}` : '') +
    (types ? `, content: ${types}` : '') +
    ')'
  );
}
