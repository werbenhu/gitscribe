import { DIFF_LIMITS, maxDiffCharsFromContext } from '../constants';
import type { CommitLanguage, GitChange } from '../types';

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

function statusText(status: number, language: CommitLanguage): string {
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

function buildUserPrompt(
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
    const header = zh
      ? `文件: ${change.path}\n状态: ${statusText(change.status, language)}`
      : `File: ${change.path}\nStatus: ${statusText(change.status, language)}`;
    let diff = change.diff;
    if (diff.length > budget) {
      diff = diff.slice(0, Math.max(0, budget)) + (zh ? '\n... (diff 超出预算已截断)' : '\n... (diff truncated)');
    }
    budget -= diff.length;
    parts.push(`${header}\n\n${diff}`);
    if (budget <= 0) {
      break;
    }
  }

  const body = parts.join('\n---\n');
  return zh
    ? `请为以下代码变更生成提交信息:\n\n${body}\n\n请直接返回提交信息,不需要额外解释。`
    : `Generate a commit message for the following changes:\n\n${body}\n\nReturn the commit message directly without any explanation.`;
}

/**
 * 构造生成提交信息的 system + user 消息。
 * customSystemPrompt 非空时覆盖对应语言的内置 system 提示词;user 消息(含 diff)始终由系统组装。
 * contextSize(tokens) 用于估算可送入的 diff 字符预算。
 */
export function buildPrompt(
  changes: GitChange[],
  language: CommitLanguage,
  customSystemPrompt?: string | null,
  contextSize?: number,
): ChatMessage[] {
  const maxChars = contextSize !== undefined
    ? maxDiffCharsFromContext(contextSize)
    : DIFF_LIMITS.MAX_TOTAL_CHARS;
  return [
    { role: 'system', content: resolveSystemPrompt(language, customSystemPrompt) },
    { role: 'user', content: buildUserPrompt(changes, language, maxChars) },
  ];
}

/**
 * 清洗模型输出:去 <think> 块、代码围栏、首尾引号,
 * 并保证标题与正文之间有空行。
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

  // 去掉整体首尾引号
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'")) ||
    (text.startsWith('`') && text.endsWith('`'))
  ) {
    text = text.slice(1, -1).trim();
  }

  // 标题与正文之间保证恰好一个空行
  const lines = text.split('\n');
  if (lines.length > 1) {
    const [first, ...rest] = lines;
    const restJoined = rest.join('\n').replace(/^\n+/, '');
    text = restJoined ? `${first}\n\n${restJoined}` : first;
  }

  return text.trim();
}
