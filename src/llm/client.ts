import type { GitChange, ResolvedConfig } from '../types';
import { callAnthropic } from './anthropic';
import { LLMError } from './http';
import { callOpenAIChat } from './openaiChat';
import { callOpenAIResponses } from './openaiResponses';
import { buildPrompt, sanitizeCommitMessage, type ChatMessage } from './prompt';

export { LLMError };

/** 按供应商的 API 格式分发调用,返回原始文本 */
async function callProvider(
  config: ResolvedConfig,
  messages: ChatMessage[],
): Promise<string> {
  const { provider, apiKey, model } = config;
  switch (provider.apiFormat) {
    case 'openai-chat':
      return callOpenAIChat(provider.baseUrl, apiKey, model, messages);
    case 'openai-responses':
      return callOpenAIResponses(provider.baseUrl, apiKey, model, messages);
    case 'anthropic':
      return callAnthropic(provider.baseUrl, apiKey, model, messages);
    default: {
      // 类型完备性检查:新增格式时此处会编译报错
      const exhaustive: never = provider.apiFormat;
      throw new LLMError(`不支持的 API 格式: ${String(exhaustive)}`);
    }
  }
}

/** 生成提交信息(已做输出清洗) */
export async function generateCommitMessage(
  changes: GitChange[],
  config: ResolvedConfig,
): Promise<string> {
  const messages = buildPrompt(
    changes,
    config.language,
    config.systemPrompt,
    config.contextSize,
  );
  const raw = await callProvider(config, messages);
  const message = sanitizeCommitMessage(raw);
  if (!message) {
    throw new LLMError('模型返回为空');
  }
  return message;
}

/** 测试连接:发一条极短请求验证 Base URL / Key / 格式 / 模型 */
export async function testConnection(config: ResolvedConfig): Promise<void> {
  const messages: ChatMessage[] = [
    { role: 'system', content: 'You are a connectivity probe.' },
    { role: 'user', content: 'Reply with exactly: ok' },
  ];
  await callProvider(config, messages);
}
