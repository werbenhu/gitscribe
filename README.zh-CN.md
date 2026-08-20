# Git Scribe

[English](./README.md) | **简体中文**

使用可配置的多模型供应商 AI 生成 Git 提交信息的 VS Code 插件。

## 功能

- **一键生成提交信息**：读取暂存区 unified diff；若暂存区为空，会先将工作区全部改动加入暂存区，再生成符合 Conventional Commits 的提交信息并填入 SCM 输入框
- **多供应商管理**：添加 / 编辑 / 删除任意数量供应商（Base URL、API Key、API 格式、模型列表）
- **快速切换当前模型**：仅在设置页侧边栏底部用下拉框选择当前供应商与模型
- **三种 API 格式**：
  - OpenAI Chat Completions（`/chat/completions`）— 兼容 DeepSeek、Kimi、智谱 GLM、通义等
  - OpenAI Responses（`/responses`）
  - Anthropic Messages（`/v1/messages`）— 含 Anthropic 兼容网关
- **按模型配置上下文**：每个模型独立设置上下文大小（默认 128k tokens），在添加模型时填写；请按真实窗口填写，偏大会触发 API 超限
- **大变更智能分诊**：暂存 diff 超出模型预算时，先让模型根据轻量清单（路径 / 增删行 / 体积）点名重点文件并展开 diff；若仍超预算再分批摘要并合并；其余文件仅保留路径语义
- **生成设置**：切换提交信息语言（中文 / 英文），自定义 System Prompt，支持一键恢复默认；可开启「记录与 AI 的会话」并在「会话记录」中查看请求/响应
- **更合理的默认提示**：变更少时正文简短；变更多时用总述 + Markdown 条目列表（`- 条目`）
- **测试连接**：保存前验证 Base URL / API Key / 格式 / 模型
- **安全存储**：API Key 存 VS Code SecretStorage；供应商配置存 `globalState`（不写 `settings.json`）

## 使用

1. 命令面板（`Ctrl+Shift+P`）→ **Git Scribe: 配置模型供应商**
2. 添加供应商（名称、Base URL、API Key、API 格式）
3. 添加模型，并为每个模型填写上下文大小（默认 128k tokens；请与模型真实窗口一致），然后保存
4. 在侧边栏底部下拉框选择当前供应商 / 模型
5. 在 Git 仓库中完成修改（可选先 `git add`）
6. 点击 SCM 标题栏生成按钮，或快捷键 `Ctrl+Alt+G` / 命令 **Git Scribe: 生成提交信息**
7. 检查 SCM 输入框中的提交信息后自行提交

若暂存区为空，会自动暂存工作区全部改动，再生成提交信息。

若暂存 diff 过大无法一次送入模型，进度可能依次显示 `正在选择重点文件…`、分批分析（如 `正在分析变更 (2/5)…`），再进入汇总步骤后填入最终提交信息。

### 配置入口

| 入口 | 操作 |
|------|------|
| 命令面板 | `Ctrl+Shift+P` → **Git Scribe: 配置模型供应商** |
| SCM 菜单 | Git 面板仓库 `...` → **Git Scribe: 配置模型供应商** |
| 生成时引导 | 未配置时点 **去配置** |

设置面板：

- 左侧：供应商列表 + **生成设置**
- 底部：**当前供应商** / **当前模型**（唯一切换当前使用的入口）
- 供应商表单：模型列表，每个模型可配置上下文
- **生成设置**：提交信息语言 + System Prompt

## 本地开发

```bash
npm install
npm run compile        # esbuild 打包到 dist/
npm run type-check     # tsc 类型检查
npm run package        # 生产构建（压缩）
npm run build          # type-check + 生产构建
```

按 `F5` 启动 Extension Development Host。

### 图标

```bash
node scripts/make-icon.js
```

从 `resources/source-icon.png` 重新生成透明底图标。

### 打包 VSIX

```bash
npm run package
npx vsce package --no-dependencies
```

通过 **Extensions: Install from VSIX...** 安装，或：

```bash
code --install-extension git-commit-scribe-1.0.5.vsix
```

## 技术说明

- 零运行时依赖：HTTP 使用 Node 18+ 内置 `fetch`（60s 超时，429/5xx 自动重试一次）
- Git 交互全部通过内置 `vscode.git` API（`diffIndexWithHEAD`、`add`、`show`），不 spawn git 进程
- esbuild 单文件打包（`dist/extension.js`）

## 发布

推送版本 tag 会触发 GitHub Actions 发布流程（构建并附带 `.vsix`）：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
