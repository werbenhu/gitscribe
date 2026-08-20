import { DIFF_LIMITS, maxDiffCharsFromContext } from '../constants';
import type { GitChange, ResolvedConfig } from '../types';
import { estimateTotalChars, packBatches } from './batch';
import { callAnthropic } from './anthropic';
import { LLMError } from './http';
import { callOpenAIChat } from './openaiChat';
import { callOpenAIResponses } from './openaiResponses';
import {
  buildMergePrompt,
  buildPrompt,
  buildSelectFilesPrompt,
  buildSummarizePrompt,
  sanitizeCommitMessage,
  type ChatMessage,
} from './prompt';
import {
  fallbackFocusChanges,
  parseFocusPaths,
  partitionByFocus,
  resolveFocusChanges,
} from './select';

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
      const exhaustive: never = provider.apiFormat;
      throw new LLMError(`不支持的 API 格式: ${String(exhaustive)}`);
    }
  }
}

export type ProgressReporter = (phase: string) => void;

/**
 * 生成提交信息。
 * - 体积在预算内:单次生成
 * - 超预算:先让模型根据轻量清单点名 → 只深挖 focus 文件 →
 *   仍超预算则对 focus 分批摘要再合并;未点名文件仅保留路径语义
 */
export async function generateCommitMessage(
  changes: GitChange[],
  config: ResolvedConfig,
  onProgress?: ProgressReporter,
): Promise<string> {
  const budget = maxDiffCharsFromContext(config.contextSize);
  const total = estimateTotalChars(changes, config.language);

  if (total <= budget) {
    return generateOnce(changes, config, onProgress);
  }

  const focused = await selectFocusFiles(changes, config, budget, onProgress);
  const { others } = partitionByFocus(changes, focused);
  const otherPaths = others.map((c) => c.path);

  if (estimateTotalChars(focused, config.language) <= budget) {
    return generateOnce(focused, config, onProgress, otherPaths);
  }

  return generateViaBatches(focused, config, budget, onProgress, otherPaths);
}

/** 轻量清单 → 模型点名;失败则本地贪心回退 */
async function selectFocusFiles(
  changes: GitChange[],
  config: ResolvedConfig,
  budget: number,
  onProgress?: ProgressReporter,
): Promise<GitChange[]> {
  onProgress?.(
    config.language === 'en-US'
      ? 'Choosing important files…'
      : '正在选择重点文件…',
  );

  try {
    const messages = buildSelectFilesPrompt(
      changes,
      config.language,
      budget,
      DIFF_LIMITS.MAX_FOCUS_FILES,
    );
    const raw = await callProvider(config, messages);
    const paths = parseFocusPaths(raw);
    const resolved = resolveFocusChanges(changes, paths);
    if (resolved.length > 0) {
      // 数量上限由提示词约束;超字符预算交给后续分批,不在此丢弃 AI 点名
      return resolved.slice(0, DIFF_LIMITS.MAX_FOCUS_FILES);
    }
  } catch {
    // 点名失败时回退,不阻断生成
  }

  return fallbackFocusChanges(
    changes,
    config.language,
    budget,
    DIFF_LIMITS.MAX_FOCUS_FILES,
  );
}

/** 对 focus 文件分批摘要再合并 */
async function generateViaBatches(
  focused: GitChange[],
  config: ResolvedConfig,
  budget: number,
  onProgress?: ProgressReporter,
  otherPaths: string[] = [],
): Promise<string> {
  const { batches, omitted } = packBatches(focused, config.language, budget);

  if (batches.length === 1 && omitted.length === 0) {
    return generateOnce(batches[0], config, onProgress, otherPaths);
  }

  if (batches.length === 0) {
    throw new LLMError(
      config.language === 'en-US'
        ? 'No changes left after packing'
        : '分包后没有可分析的变更',
    );
  }

  const batchCount = batches.length;
  const summaries: string[] = [];

  for (let i = 0; i < batchCount; i++) {
    const label = config.language === 'en-US'
      ? `Analyzing changes (${i + 1}/${batchCount})…`
      : `正在分析变更 (${i + 1}/${batchCount})…`;
    onProgress?.(label);

    const messages = buildSummarizePrompt(
      batches[i],
      config.language,
      i + 1,
      batchCount,
      config.contextSize,
    );
    const summary = (await callProvider(config, messages)).trim();
    if (!summary) {
      throw new LLMError(
        config.language === 'en-US'
          ? `Batch ${i + 1} summary was empty`
          : `第 ${i + 1} 批摘要为空`,
      );
    }
    summaries.push(summary);
  }

  onProgress?.(
    config.language === 'en-US' ? 'Merging commit message…' : '正在汇总提交信息…',
  );

  const omittedPaths = [
    ...omitted.map((c) => c.path),
    ...otherPaths,
  ];
  const mergeMessages = buildMergePrompt(
    summaries,
    config.language,
    config.systemPrompt,
    omittedPaths,
  );
  const raw = await callProvider(config, mergeMessages);
  return finalizeMessage(raw);
}

async function generateOnce(
  changes: GitChange[],
  config: ResolvedConfig,
  onProgress?: ProgressReporter,
  otherPaths?: string[],
): Promise<string> {
  onProgress?.(config.language === 'en-US' ? 'Generating…' : '正在生成…');
  const messages = buildPrompt(
    changes,
    config.language,
    config.systemPrompt,
    config.contextSize,
    otherPaths,
  );
  const raw = await callProvider(config, messages);
  return finalizeMessage(raw);
}

function finalizeMessage(raw: string): string {
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
