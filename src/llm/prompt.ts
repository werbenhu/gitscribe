import { DIFF_LIMITS, maxDiffCharsFromContext } from '../constants';
import type { CommitLanguage, GitChange } from '../types';
import { changeHeader, estimateChangeChars } from './batch';
import { formatChangeManifest } from './select';

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

/** 内置 system 提示词(按语言),参考 AIGitCommit 的约定式提交说明 */
export function getDefaultSystemPrompt(language: CommitLanguage): string {
  if (language === 'en-US') {
    return [
      'You are a professional Git commit message generator.',
      'Generate concise, professional, and standards-compliant commit messages based on the provided code changes.',
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
      '- Example title: feat(auth): add user login functionality',
      '- Commit title should not exceed 72 characters, strongly recommended within 50 characters',
      '- Title should clearly describe "what was done" using imperative mood, no trailing period',
      '- Separate title and body with a blank line when a body is needed',
      '- Body style depends on change size:',
      '  * Small / single-purpose change: one short paragraph is enough (or title only if fully clear)',
      '  * Large / multi-aspect change: one short intro sentence, then a Markdown bullet list',
      '  * Each bullet MUST start with "- " (hyphen + space), which renders as a left bullet (·)',
      '  * Prefer 2–6 bullets; each bullet starts with a verb and stays concise',
      '  * Do NOT use numbered lists, asterisks, or bare lines without the "- " prefix',
      '  * Do NOT turn a tiny change into a long bullet list',
      '- Body should explain "why" and "what", not a file list or path dump',
      '- Write the message in English',
      '- Return ONLY the commit message itself: no explanations, no quote wrapping, no markdown code fences',
      '- Do NOT write any preamble, analysis, or notes before the message (e.g. "Because...", "Based on...", "Here is...")',
      '- The first line MUST be the Conventional Commits subject, e.g. feat(ui): xxx',
      '- Do not use <think> tags or show thinking process',
      '- Do not include any XML tags or special markers',
      '- Focus on actual functional changes in the code, not file names or paths',
      '',
      'Examples:',
      '',
      'Small change:',
      'fix(ui): correct empty-state label on settings page',
      '',
      'Large change:',
      'feat(llm): improve multi-provider commit generation',
      '',
      'Add provider switching and connection testing in settings.',
      '- Support OpenAI Chat, OpenAI Responses, and Anthropic formats',
      '- Stage all working-tree changes when the index is empty',
      '- Strengthen default System Prompt and empty-response handling',
    ].join('\n');
  }

  return [
    '你是一个专业的 Git 提交信息生成助手。',
    '请根据提供的代码变更内容，生成简洁、专业、符合规范的提交信息。',
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
    '- 示例标题：feat(auth): 添加用户登录功能',
    '- 提交标题不超过 72 个字符，强烈建议在 50 个字符以内',
    '- 标题应该清晰描述「做了什么」，使用祈使语气，结尾不加句号',
    '- 需要正文时，标题与正文之间空一行',
    '- 正文风格按变更规模选择：',
    '  * 变更少 / 单一目的：用一段简短正文即可（标题已说清时也可不要正文）',
    '  * 变更多 / 涉及多个方面：先写一句总述，再用 Markdown 无序列表',
    '  * 每条必须以「- 」（连字符 + 空格）开头，渲染后左侧会显示圆点（·）',
    '  * 条目建议 2–6 条；每条以动词开头，简洁具体',
    '  * 不要用数字编号、星号，也不要写成没有「- 」前缀的普通行',
    '  * 不要把很小的改动硬拆成一长串条目',
    '- 正文说明「为什么」和「改了什么」，不要罗列文件名或路径',
    '- 使用简体中文输出',
    '- 只返回提交信息本身：不要额外解释、不要引号包裹、不要 markdown 代码块',
    '- 不要在提交信息前写任何前言、分析或说明（例如「由于…」「基于…」「生成如下」等）',
    '- 第一行必须是符合约定式提交格式的标题，例如 feat(ui): xxx',
    '- 不要使用 <think> 标签或展示思考过程',
    '- 不要包含任何 XML 标签或特殊标记',
    '- 关注代码的实际功能变化，而不是文件名或路径',
    '',
    '示例：',
    '',
    '小改动：',
    'fix(ui): 修正设置页空状态文案',
    '',
    '大改动：',
    'feat(llm): 增强多供应商提交信息生成',
    '',
    '完善供应商切换与连接测试，提升生成稳定性。',
    '- 支持 OpenAI Chat、OpenAI Responses、Anthropic 三种格式',
    '- 暂存区为空时自动暂存工作区全部改动',
    '- 加强默认 System Prompt 与空响应处理',
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

function buildUserPrompt(
  changes: GitChange[],
  language: CommitLanguage,
  maxTotalChars?: number,
  otherPaths?: string[],
): string {
  const zh = language !== 'en-US';
  const body = formatChangesBody(changes, language, maxTotalChars);
  let others = '';
  if (otherPaths && otherPaths.length > 0) {
    const list = otherPaths.map((p) => `- ${p}`).join('\n');
    others = zh
      ? `\n\n以下文件未展开全文(体积或优先级原因),生成时请结合路径语义一并考虑:\n${list}`
      : `\n\nThese files were not expanded in full (size/priority); consider their path semantics:\n${list}`;
  }
  return zh
    ? `请为以下代码变更生成提交信息:\n\n${body}${others}\n\n请直接返回提交信息,不需要额外解释。`
    : `Generate a commit message for the following changes:\n\n${body}${others}\n\nReturn the commit message directly without any explanation.`;
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
    ? `以下是多批代码变更的摘要。请综合它们,生成一条符合约定式提交的完整提交信息。\n\n${blocks}${omittedSection}\n\n请直接返回提交信息,不需要额外解释。`
    : `Below are summaries of multiple batches of code changes. Synthesize them into one Conventional Commits message.\n\n${blocks}${omittedSection}\n\nReturn the commit message directly without any explanation.`;

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
