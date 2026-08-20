import { DIFF_LIMITS } from '../constants';
import type { CommitLanguage, GitChange } from '../types';

/** 分隔符与换行在拼装 user 消息时的固定开销 */
const SEPARATOR_CHARS = '\n---\n'.length;
const HEADER_EXTRA = 4; // `\n\n` between header and diff

function statusLabel(status: number, language: CommitLanguage): string {
  const zh = language !== 'en-US';
  switch (status) {
    case 0:
      return zh ? '新增' : 'added';
    case 1:
    case 5:
      return zh ? '修改' : 'modified';
    case 2:
    case 6:
      return zh ? '删除' : 'deleted';
    case 3:
      return zh ? '重命名' : 'renamed';
    default:
      return zh ? '变更' : 'changed';
  }
}

/** 变更块在 prompt 中的 header 文本(不含 diff) */
export function changeHeader(change: GitChange, language: CommitLanguage): string {
  const zh = language !== 'en-US';
  return zh
    ? `文件: ${change.path}\n状态: ${statusLabel(change.status, language)}`
    : `File: ${change.path}\nStatus: ${statusLabel(change.status, language)}`;
}

/** 估算单个变更块写入 prompt 后占用的字符数(含 header 与分隔余量) */
export function estimateChangeChars(
  change: GitChange,
  language: CommitLanguage,
  diffOverride?: string,
): number {
  const header = changeHeader(change, language);
  const diff = diffOverride ?? change.diff;
  return header.length + HEADER_EXTRA + diff.length + SEPARATOR_CHARS;
}

/** 若单文件 diff 超过预算,截断后返回新的 GitChange */
export function truncateChangeToBudget(
  change: GitChange,
  language: CommitLanguage,
  budget: number,
): GitChange {
  const header = changeHeader(change, language);
  const overhead = header.length + HEADER_EXTRA + SEPARATOR_CHARS;
  const maxDiff = Math.max(0, budget - overhead);
  if (change.diff.length <= maxDiff) {
    return change;
  }
  const zh = language !== 'en-US';
  const marker = zh ? '\n... (diff 超出预算已截断)' : '\n... (diff truncated)';
  const keep = Math.max(0, maxDiff - marker.length);
  return {
    ...change,
    diff: change.diff.slice(0, keep) + marker,
  };
}

function toOmittedSnippet(change: GitChange, language: CommitLanguage): GitChange {
  const snippet = DIFF_LIMITS.OMITTED_FILE_SNIPPET_CHARS;
  if (change.diff.length <= snippet) {
    return change;
  }
  const zh = language !== 'en-US';
  const marker = zh ? '\n... (仅保留路径摘要)' : '\n... (path summary only)';
  return {
    ...change,
    diff: change.diff.slice(0, Math.max(0, snippet - marker.length)) + marker,
  };
}

export interface PackedBatches {
  /** 需要做全文摘要的批次(每批 diff 总和 ≤ budget) */
  batches: GitChange[][];
  /** 超出 MAX_SUMMARY_BATCHES 后压成路径清单的文件 */
  omitted: GitChange[];
}

/**
 * 按字符预算把变更贪心打包成多批。
 * 单文件超预算时先截断再单独成批。
 * 超过 maxBatches 的剩余文件进入 omitted(仅保留短截断)。
 */
export function packBatches(
  changes: GitChange[],
  language: CommitLanguage,
  budget: number,
  maxBatches: number = DIFF_LIMITS.MAX_SUMMARY_BATCHES,
): PackedBatches {
  const prepared = changes.map((c) => truncateChangeToBudget(c, language, budget));
  const batches: GitChange[][] = [];
  let current: GitChange[] = [];
  let used = 0;

  const flush = (): void => {
    if (current.length === 0) {
      return;
    }
    batches.push(current);
    current = [];
    used = 0;
  };

  for (let i = 0; i < prepared.length; i++) {
    // 已满摘要批次数:剩余全部进 omitted
    if (batches.length >= maxBatches) {
      const omitted = prepared.slice(i).map((c) => toOmittedSnippet(c, language));
      return { batches, omitted };
    }

    const change = prepared[i];
    const size = estimateChangeChars(change, language);

    if (current.length > 0 && used + size > budget) {
      flush();
      // flush 后若已达上限,当前文件起全部 omitted
      if (batches.length >= maxBatches) {
        const omitted = prepared.slice(i).map((c) => toOmittedSnippet(c, language));
        return { batches, omitted };
      }
    }

    current.push(change);
    used += size;
  }

  flush();
  return { batches, omitted: [] };
}

/** 估算全部变更写入单次 prompt 的总字符数 */
export function estimateTotalChars(
  changes: GitChange[],
  language: CommitLanguage,
): number {
  return changes.reduce((sum, c) => sum + estimateChangeChars(c, language), 0);
}
