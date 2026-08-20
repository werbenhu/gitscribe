import { DIFF_LIMITS } from '../constants';
import type { CommitLanguage, GitChange } from '../types';
import { estimateChangeChars } from './batch';

export interface DiffLineStats {
  additions: number;
  deletions: number;
}

/** 从 unified diff 粗算增删行(忽略文件头) */
export function countDiffStats(diff: string): DiffLineStats {
  let additions = 0;
  let deletions = 0;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) {
      continue;
    }
    if (line.startsWith('+')) {
      additions += 1;
    } else if (line.startsWith('-')) {
      deletions += 1;
    }
  }
  return { additions, deletions };
}

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

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '').trim();
}

/** 轻量变更清单(无全文 diff),供模型点名 */
export function formatChangeManifest(
  changes: GitChange[],
  language: CommitLanguage,
): string {
  const zh = language !== 'en-US';
  return changes
    .map((change, index) => {
      const stats = countDiffStats(change.diff);
      const size = change.diff.length;
      const status = statusLabel(change.status, language);
      if (zh) {
        return `${index + 1}. ${change.path}\n   状态: ${status} | +${stats.additions}/-${stats.deletions} | 约 ${size} 字符`;
      }
      return `${index + 1}. ${change.path}\n   status: ${status} | +${stats.additions}/-${stats.deletions} | ~${size} chars`;
    })
    .join('\n');
}

/**
 * 将模型返回的路径列表匹配到本地 GitChange。
 * 支持绝对路径、相对路径、以及后缀匹配。
 */
export function resolveFocusChanges(
  changes: GitChange[],
  requestedPaths: string[],
): GitChange[] {
  const remaining = [...changes];
  const focused: GitChange[] = [];

  for (const raw of requestedPaths) {
    const want = normalizePath(raw);
    if (!want) {
      continue;
    }

    let idx = remaining.findIndex((c) => normalizePath(c.path) === want);
    if (idx < 0) {
      idx = remaining.findIndex((c) => {
        const p = normalizePath(c.path);
        return p.endsWith('/' + want) || p.endsWith(want) || want.endsWith(p);
      });
    }
    if (idx < 0) {
      continue;
    }
    focused.push(remaining[idx]);
    remaining.splice(idx, 1);
  }

  return focused;
}

/**
 * 解析模型点名结果。优先 JSON {"focus":["a","b"]}；
 * 回退:提取像路径的行。
 */
export function parseFocusPaths(raw: string): string[] {
  const text = raw.trim();
  if (!text) {
    return [];
  }

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { focus?: unknown; files?: unknown };
      const list = parsed.focus ?? parsed.files;
      if (Array.isArray(list)) {
        return list
          .filter((item): item is string => typeof item === 'string')
          .map((s) => s.trim())
          .filter(Boolean);
      }
    } catch {
      // fall through
    }
  }

  const paths: string[] = [];
  for (const line of text.split('\n')) {
    let cleaned = line.trim();
    cleaned = cleaned.replace(/^[-*]\s+/, '');
    cleaned = cleaned.replace(/^\d+[.)]\s+/, '');
    cleaned = cleaned.replace(/^["'`]|["'`]$/g, '');
    cleaned = cleaned.replace(/,$/, '').trim();
    if (!cleaned || cleaned.startsWith('{') || cleaned.startsWith('}')) {
      continue;
    }
    if (cleaned.includes(' ') && !cleaned.includes('/') && !cleaned.includes('\\')) {
      continue;
    }
    if (/^focus\s*:/i.test(cleaned)) {
      cleaned = cleaned.replace(/^focus\s*:/i, '').trim();
    }
    if (cleaned.length > 0 && cleaned.length < 512) {
      paths.push(cleaned);
    }
  }
  return paths;
}

/**
 * 若模型点名失败或过空:按「非占位 diff 优先、体积适中」贪心塞满预算。
 */
export function fallbackFocusChanges(
  changes: GitChange[],
  language: CommitLanguage,
  budget: number,
  maxFiles: number = DIFF_LIMITS.MAX_FOCUS_FILES,
): GitChange[] {
  const ranked = [...changes].sort((a, b) => {
    const aStub = isStubDiff(a.diff) ? 1 : 0;
    const bStub = isStubDiff(b.diff) ? 1 : 0;
    if (aStub !== bStub) {
      return aStub - bStub;
    }
    // 中等体积优先于巨型文件(巨型稍后截断)
    return a.diff.length - b.diff.length;
  });

  const picked: GitChange[] = [];
  let used = 0;
  for (const change of ranked) {
    if (picked.length >= maxFiles) {
      break;
    }
    const size = estimateChangeChars(change, language);
    if (picked.length > 0 && used + size > budget) {
      continue;
    }
    picked.push(change);
    used += Math.min(size, budget);
  }
  return picked.length > 0 ? picked : changes.slice(0, 1);
}

function isStubDiff(diff: string): boolean {
  return (
    diff.startsWith('[二进制') ||
    diff.startsWith('[生成') ||
    diff.startsWith('[无法') ||
    /^\[Binary/i.test(diff)
  );
}

export function partitionByFocus(
  changes: GitChange[],
  focused: GitChange[],
): { focused: GitChange[]; others: GitChange[] } {
  const focusSet = new Set(focused.map((c) => c.path));
  const others = changes.filter((c) => !focusSet.has(c.path));
  return { focused, others };
}
