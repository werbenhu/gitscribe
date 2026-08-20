import { DIFF_LIMITS, maxDiffCharsFromContext } from '../constants';
import type { CommitLanguage, GitChange } from '../types';
import { changeHeader, estimateChangeChars } from './batch';
import { countDiffStats, formatChangeManifest } from './select';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** 内置 system 提示词(按语言),参考 AIGitCommit 的约定式提交说明 */
export function getDefaultSystemPrompt(language: CommitLanguage): string {
  if (language === 'en-US') {
    return [
      'You are a professional Git commit message generator.',
      'Write the message ONLY from the provided diff. Ground every claim in that diff.',
      '',
      'Hard rules:',
      '- Do NOT invent features, refactors, or behaviors that are not clearly shown in the diff',
      '- Do NOT copy or paraphrase the examples below when they do not match the diff',
      '- Do NOT write release-note style marketing copy for a tiny change',
      '- Match message scale to change scale: few lines / 1–2 files → title only, or title + one short sentence; no bullet list',
      '- Use bullets only when the diff clearly contains multiple independent aspects',
      '',
      'Requirements:',
      '- Strictly use Conventional Commits format',
      '- Format: <type>(<scope>): <subject>',
      '- scope is optional but recommended to clarify the change scope',
      '- No space between type and colon, must have one space after colon',
      '- Common types and usage scenarios:',
      '  * feat: New feature or functionality',
      '  * fix: Bug fix or issue resolution',
      '  * docs: Documentation only changes (README, comments, etc.)',
      '  * style: Code style changes that do not affect logic (whitespace, formatting, missing semicolons, etc.)',
      '  * refactor: Code refactoring that neither fixes bugs nor adds features',
      '  * perf: Performance improvements',
      '  * test: Adding or modifying test code',
      '  * build: Changes affecting build system or external dependencies (webpack, npm, gulp, etc.)',
      '  * ci: CI configuration files and scripts changes (Travis, Circle, GitHub Actions, etc.)',
      '  * chore: Other changes that do not modify src or test files (update dependencies, config files, etc.)',
      '  * revert: Revert a previous commit',
      '- Commit title should not exceed 72 characters, strongly recommended within 50 characters',
      '- Title should clearly describe "what was done" using imperative mood, no trailing period',
      '- Separate title and body with a blank line when a body is needed',
      '- When using a bullet body: each bullet MUST start with "- "; prefer 2–6 bullets; no numbered lists or asterisks',
      '- Body should explain "why" and "what", not a file list or path dump',
      '- Write the message in English',
      '- Return ONLY the commit message itself: no explanations, no quote wrapping, no markdown code fences',
      '- Do NOT write any preamble before the message',
      '- The first line MUST be the Conventional Commits subject',
      '- Do not use <think> tags or show thinking process',
      '',
      'Examples (illustrative only — do not reuse unless the diff matches):',
      '',
      'Small change:',
      'fix(ui): correct empty-state label on settings page',
      '',
      'Large change:',
      'feat(auth): add OAuth login and session refresh',
      '',
      'Support signing in with external identity providers.',
      '- Add OAuth callback handling and token exchange',
      '- Persist refresh tokens securely',
      '- Cover expired-session redirect in the web UI',
    ].join('\n');
  }

  return [
    '你是一个专业的 Git 提交信息生成助手。',
    '只能依据用户消息里提供的 diff 撰写提交信息，每条表述都必须能在 diff 中找到依据。',
    '',
    '硬性约束：',
    '- 禁止臆造 diff 中未出现的功能、重构或行为',
    '- 禁止套用下方示例的措辞/结构（示例仅供格式参考，与本次 diff 无关时绝不能照抄）',
    '- 禁止把很小的改动写成发布说明式、宣传式长文',
    '- 规模必须匹配：几行改动 / 1–2 个文件 → 只要标题，或标题 + 一句短正文；不要用条目列表',
    '- 仅当 diff 明确包含多个彼此独立的方面时，才使用条目列表',
    '',
    '要求：',
    '- 严格使用约定式提交格式（Conventional Commits）',
    '- 格式：<type>(<scope>): <subject>',
    '- scope 是可选的，但建议添加以明确变更范围',
    '- type 和冒号之间不要有空格，冒号后必须有一个空格',
    '- 常用类型及使用场景：',
    '  * feat: 新增功能或特性',
    '  * fix: 修复 bug 或问题',
    '  * docs: 仅文档变更（README、注释等）',
    '  * style: 代码格式调整，不影响代码逻辑（空格、格式化、缺少分号等）',
    '  * refactor: 代码重构，既不修复 bug 也不添加功能',
    '  * perf: 性能优化',
    '  * test: 添加或修改测试代码',
    '  * build: 影响构建系统或外部依赖的变更（webpack、npm、gulp 等）',
    '  * ci: CI 配置文件和脚本的变更（Travis、Circle、GitHub Actions 等）',
    '  * chore: 其他不修改 src 或 test 文件的变更（更新依赖、配置文件等）',
    '  * revert: 回退之前的提交',
    '- 提交标题不超过 72 个字符，强烈建议在 50 个字符以内',
    '- 标题应该清晰描述「做了什么」，使用祈使语气，结尾不加句号',
    '- 需要正文时，标题与正文之间空一行',
    '- 使用条目时：每条必须以「- 」开头；建议 2–6 条；不要用数字编号或星号',
    '- 正文说明「为什么」和「改了什么」，不要罗列文件名或路径',
    '- 使用简体中文输出',
    '- 只返回提交信息本身：不要额外解释、不要引号包裹、不要 markdown 代码块',
    '- 不要在提交信息前写任何前言、分析或说明',
    '- 第一行必须是符合约定式提交格式的标题',
    '- 不要使用 <think> 标签或展示思考过程',
    '',
    '示例（仅说明格式，勿在不符时照抄）：',
    '',
    '小改动：',
    'fix(ui): 修正设置页空状态文案',
    '',
    '大改动：',
    'feat(auth): 增加 OAuth 登录与会话刷新',
    '',
    '支持通过外部身份提供商登录。',
    '- 增加 OAuth 回调处理与令牌交换',
    '- 安全持久化刷新令牌',
    '- 覆盖会话过期后的页面跳转',
  ].join('\n');
}

function resolveSystemPrompt(
  language: CommitLanguage,
  customSystemPrompt?: string | null,
): string {
  const custom = customSystemPrompt?.trim();
  return custom || getDefaultSystemPrompt(language);
}

/** 把变更列表拼成带预算的正文(计入 header / 分隔符) */
function formatChangesBody(
  changes: GitChange[],
  language: CommitLanguage,
  maxTotalChars?: number,
): string {
  const zh = language !== 'en-US';
  let budget = maxTotalChars && maxTotalChars > 0
    ? maxTotalChars
    : DIFF_LIMITS.MAX_TOTAL_CHARS;
  const parts: string[] = [];

  for (const change of changes) {
    const header = changeHeader(change, language);
    const overhead = estimateChangeChars(change, language, '');
    let diff = change.diff;
    const roomForDiff = Math.max(0, budget - overhead);
    if (diff.length > roomForDiff) {
      const marker = zh ? '\n... (diff 超出预算已截断)' : '\n... (diff truncated)';
      const keep = Math.max(0, roomForDiff - marker.length);
      diff = diff.slice(0, keep) + marker;
    }
    const block = `${header}\n\n${diff}`;
    budget -= estimateChangeChars(change, language, diff);
    parts.push(block);
    if (budget <= 0) {
      break;
    }
  }

  return parts.join('\n---\n');
}

function isUnreadStub(diff: string): boolean {
  return (
    diff.startsWith('[无法读取') ||
    diff.startsWith('[Unable to read') ||
    /^\[无法读取文件内容/.test(diff)
  );
}

/** 根据文件数与增删行给模型明确的规模信号,抑制小改动写成长文 */
function describeChangeScale(changes: GitChange[], language: CommitLanguage): string {
  const zh = language !== 'en-US';
  let additions = 0;
  let deletions = 0;
  let unread = 0;
  for (const change of changes) {
    if (isUnreadStub(change.diff)) {
      unread += 1;
      continue;
    }
    const stats = countDiffStats(change.diff);
    additions += stats.additions;
    deletions += stats.deletions;
  }
  const files = changes.length;
  const touched = additions + deletions;
  const small = files <= 2 && touched <= 40 && unread === 0;

  if (zh) {
    if (unread > 0 && touched === 0) {
      return (
        `变更规模: ${files} 个文件,其中 ${unread} 个未能读取 diff 正文。` +
        `请仅依据路径与状态谨慎生成简短标题,不要臆造具体改动细节。`
      );
    }
    const base = `变更规模: ${files} 个文件, +${additions}/-${deletions} 行。`;
    return small
      ? `${base}这是小改动:只写标题,或标题加一句短正文;禁止条目列表,禁止夸大或脑补未出现的功能。`
      : `${base}请严格依据下方 diff 撰写,不要添加 diff 中没有的能力描述。`;
  }

  if (unread > 0 && touched === 0) {
    return (
      `Change scale: ${files} file(s), ${unread} with unreadable diffs. ` +
      `Write a cautious short title from path/status only; do not invent change details.`
    );
  }
  const base = `Change scale: ${files} file(s), +${additions}/-${deletions} lines.`;
  return small
    ? `${base} This is a small change: title only, or title plus one short sentence; no bullet list; do not invent features.`
    : `${base} Write strictly from the diff below; do not add capabilities not shown there.`;
}

function buildUserPrompt(
  changes: GitChange[],
  language: CommitLanguage,
  maxTotalChars?: number,
  otherPaths?: string[],
): string {
  const zh = language !== 'en-US';
  const scale = describeChangeScale(changes, language);
  const body = formatChangesBody(changes, language, maxTotalChars);
  let others = '';
  if (otherPaths && otherPaths.length > 0) {
    const list = otherPaths.map((p) => `- ${p}`).join('\n');
    others = zh
      ? `\n\n以下文件未展开全文(体积或优先级原因),生成时请结合路径语义一并考虑,但不要臆造其具体改动:\n${list}`
      : `\n\nThese files were not expanded in full (size/priority); consider path semantics only, and do not invent their concrete changes:\n${list}`;
  }
  return zh
    ? `${scale}\n\n请为以下代码变更生成提交信息:\n\n${body}${others}\n\n请直接返回提交信息,不需要额外解释。`
    : `${scale}\n\nGenerate a commit message for the following changes:\n\n${body}${others}\n\nReturn the commit message directly without any explanation.`;
}

/**
 * 构造「点名深挖文件」提示:只给轻量清单,让模型决定看哪些全文 diff。
 */
export function buildSelectFilesPrompt(
  changes: GitChange[],
  language: CommitLanguage,
  budgetChars: number,
  maxFocusFiles: number = DIFF_LIMITS.MAX_FOCUS_FILES,
): ChatMessage[] {
  const zh = language !== 'en-US';
  const manifest = formatChangeManifest(changes, language);
  const system = zh
    ? [
        '你是 Git 变更分诊助手。',
        '根据文件清单(无全文 diff)决定哪些文件值得展开细读,以便生成准确的提交信息。',
        '不要写 commit message,不要解释。',
        '不要使用 <think> 标签。',
        '只输出一段 JSON,格式严格为: {"focus":["路径1","路径2"]}',
        '规则:',
        '- 优先业务源码,其次测试/配置;锁文件、构建产物、二进制通常不要放入 focus',
        `- focus 最多 ${maxFocusFiles} 个`,
        `- focus 文件的「约 N 字符」合计尽量不超过 ${budgetChars}`,
        '- 路径必须来自清单,不要编造',
      ].join('\n')
    : [
        'You are a git change triage assistant.',
        'From a file manifest (no full diffs), choose which files deserve a full diff read to write an accurate commit message.',
        'Do NOT write a commit message. Do NOT explain.',
        'Do NOT use <think> tags.',
        'Output ONLY JSON of the form: {"focus":["path1","path2"]}',
        'Rules:',
        '- Prefer business source, then tests/config; usually skip lockfiles, build artifacts, binaries',
        `- At most ${maxFocusFiles} paths in focus`,
        `- Combined "~N chars" of focus files should stay under ${budgetChars} when possible`,
        '- Paths must come from the manifest; do not invent paths',
      ].join('\n');

  const user = zh
    ? `变更清单如下。请选出需要展开全文的文件:\n\n${manifest}\n\n只返回 JSON。`
    : `File manifest below. Pick files to expand in full:\n\n${manifest}\n\nReturn JSON only.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

function getSummarizeSystemPrompt(language: CommitLanguage): string {
  if (language === 'en-US') {
    return [
      'You are a code change analyst.',
      'Summarize the provided git diffs into structured bullet points.',
      'Do NOT write a git commit message.',
      'Do NOT use <think> tags or show a reasoning process.',
      'Output only:',
      '1) One-line theme',
      '2) Bullet list of what changed and why (each line starts with "- ")',
      '3) Optional scope/module candidates (comma-separated)',
      'Write in English.',
    ].join('\n');
  }
  return [
    '你是代码变更分析助手。',
    '请将提供的 git diff 总结为结构化要点。',
    '不要写 git 提交信息。',
    '不要使用 <think> 标签或展示思考过程。',
    '只输出：',
    '1) 一句话主题',
    '2) 变更要点列表（每行以「- 」开头，说明做了什么以及为何）',
    '3) 可选的 scope/模块候选（逗号分隔）',
    '使用简体中文。',
  ].join('\n');
}

/**
 * 构造「批摘要」提示:只产出结构化要点,不写 commit message。
 */
export function buildSummarizePrompt(
  changes: GitChange[],
  language: CommitLanguage,
  batchIndex: number,
  batchCount: number,
  contextSize?: number,
): ChatMessage[] {
  const zh = language !== 'en-US';
  const maxChars = contextSize !== undefined
    ? maxDiffCharsFromContext(contextSize)
    : DIFF_LIMITS.MAX_TOTAL_CHARS;
  const body = formatChangesBody(changes, language, maxChars);
  const user = zh
    ? `这是第 ${batchIndex}/${batchCount} 批代码变更,请总结要点(不要写提交信息):\n\n${body}`
    : `This is batch ${batchIndex}/${batchCount} of code changes. Summarize the key points (do NOT write a commit message):\n\n${body}`;
  return [
    { role: 'system', content: getSummarizeSystemPrompt(language) },
    { role: 'user', content: user },
  ];
}

/**
 * 构造「合并摘要 → 最终提交信息」提示。
 * customSystemPrompt 非空时覆盖内置 Conventional Commits system 提示词。
 */
export function buildMergePrompt(
  summaries: string[],
  language: CommitLanguage,
  customSystemPrompt?: string | null,
  omittedPaths?: string[],
): ChatMessage[] {
  const zh = language !== 'en-US';
  const blocks = summaries
    .map((s, i) => (zh ? `【批次 ${i + 1} 摘要】\n${s}` : `[Batch ${i + 1} summary]\n${s}`))
    .join('\n\n');

  let omittedSection = '';
  if (omittedPaths && omittedPaths.length > 0) {
    const list = omittedPaths.map((p) => `- ${p}`).join('\n');
    omittedSection = zh
      ? `\n\n以下文件因体积过大未纳入详细摘要,生成时请一并考虑其路径语义:\n${list}`
      : `\n\nThe following files were omitted from detailed summaries due to size; consider their path semantics:\n${list}`;
  }

  const user = zh
    ? `以下是多批代码变更的摘要。请综合它们,生成一条符合约定式提交的完整提交信息。\n只使用摘要中确实出现的信息,不要脑补或夸大。\n\n${blocks}${omittedSection}\n\n请直接返回提交信息,不需要额外解释。`
    : `Below are summaries of multiple batches of code changes. Synthesize them into one Conventional Commits message.\nUse only facts present in the summaries; do not invent or exaggerate.\n\n${blocks}${omittedSection}\n\nReturn the commit message directly without any explanation.`;

  return [
    { role: 'system', content: resolveSystemPrompt(language, customSystemPrompt) },
    { role: 'user', content: user },
  ];
}

/**
 * 构造生成提交信息的 system + user 消息。
 * customSystemPrompt 非空时覆盖对应语言的内置 system 提示词;user 消息(含 diff)始终由系统组装。
 * contextSize(tokens) 用于估算可送入的 diff 字符预算。
 * otherPaths: 未展开全文的路径,仅作语义参考。
 */
export function buildPrompt(
  changes: GitChange[],
  language: CommitLanguage,
  customSystemPrompt?: string | null,
  contextSize?: number,
  otherPaths?: string[],
): ChatMessage[] {
  const maxChars = contextSize !== undefined
    ? maxDiffCharsFromContext(contextSize)
    : DIFF_LIMITS.MAX_TOTAL_CHARS;
  return [
    { role: 'system', content: resolveSystemPrompt(language, customSystemPrompt) },
    { role: 'user', content: buildUserPrompt(changes, language, maxChars, otherPaths) },
  ];
}

/**
 * 清洗模型输出:去 <think> 块、代码围栏、首尾引号,
 * 并尽量剥掉模型在提交信息前加的解释性前言。
 */
export function sanitizeCommitMessage(raw: string): string {
  let text = raw.trim();

  // 去掉 <think>...</think>(推理模型)
  text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 去掉 markdown 代码围栏
  const fence = text.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n?```$/);
  if (fence) {
    text = fence[1].trim();
  }

  // 若整体被引号包裹,先剥掉
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    text = text.slice(1, -1).trim();
  }

  const lines = text.split('\n');
  const subjectIndex = findSubjectLineIndex(lines);
  if (subjectIndex > 0) {
    // 丢弃首条标题之前的所有解释性内容
    text = lines.slice(subjectIndex).join('\n').trim();
  }

  const finalLines = text.split('\n');
  if (finalLines.length > 1) {
    const [first, ...rest] = finalLines;
    const restJoined = rest.join('\n').replace(/^\n+/, '');
    text = restJoined ? `${first}\n\n${restJoined}` : first;
  }

  return text.trim();
}

/**
 * 找到第一个像提交标题的行(以常见 type 开头),返回其行号;
 * 找不到则返回 0(表示第一行就是标题)。
 */
function findSubjectLineIndex(lines: string[]): number {
  const subjectRe = new RegExp(
    '^\\s*(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)' +
      '(\\([^)]*\\))?!?\\s*:\\s*\\S',
    'i',
  );
  const maxScan = Math.min(lines.length, 12);
  for (let i = 0; i < maxScan; i++) {
    if (subjectRe.test(lines[i])) {
      return i;
    }
  }
  return 0;
}
