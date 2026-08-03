# Git Scribe

[English](./README.md) | **简体中文**

使用可配置的多模型供应商 AI 生成 Git 提交信息的 VSCode 插件。

## 功能

- **一键生成提交信息**：读取暂存区的真实 unified diff；若暂存区为空，会先将工作区全部改动加入暂存区，再生成符合 Conventional Commits 规范的提交信息并填入 SCM 输入框
- **多供应商管理**：左侧供应商列表 + 右侧表单的管理界面，支持添加 / 编辑 / 删除任意数量的供应商
- **三种 API 格式**：
  - OpenAI Chat Completions（`/chat/completions`）— 兼容 DeepSeek、Kimi、智谱 GLM、通义等绝大多数服务
  - OpenAI Responses（`/responses`）
  - Anthropic Messages（`/v1/messages`）
- **可配置 System Prompt**：中英文提示可自定义，支持一键恢复默认
- **测试连接**：保存前验证 Base URL / API Key / 格式 / 模型是否可用
- **中英文提交信息**：在设置页 **生成设置** 中切换生成语言
- **安全存储**：API Key 保存在 VSCode SecretStorage（系统级加密），供应商配置存 globalState，不写入 settings.json

## 使用

1. 命令面板（`Ctrl+Shift+P`）执行 **Git Scribe: 配置模型供应商**，添加供应商并填入 API Key，点击模型上的「使用」设为当前模型
2. 在 Git 仓库中完成修改（可选：先 `git add`）
3. 点击 SCM 面板标题栏的生成按钮（或快捷键 `Ctrl+Alt+G` / 命令 **Git Scribe: 生成提交信息**）
4. 若暂存区为空，会自动 `git add` 工作区全部改动，再生成提交信息并填入输入框，检查后自行提交

### 配置入口

| 入口 | 操作 |
|------|------|
| 命令面板 | `Ctrl+Shift+P` → **Git Scribe: 配置模型供应商** |
| SCM 菜单 | Git 面板仓库 `...` → 配置模型供应商 |
| 生成时引导 | 未配置时点 **去配置** |

设置面板左侧可进入 **「生成设置」**，配置语言与 System Prompt。

## 本地开发

```bash
npm install
npm run compile        # esbuild 打包到 dist/
npm run type-check     # tsc 类型检查
npm run package        # 生产构建（压缩）
```

按 `F5` 启动 Extension Development Host 调试。

### 打包 VSIX

```bash
npm run package
npx vsce package --no-dependencies
```

通过 **Extensions: Install from VSIX...** 安装，或：

```bash
code --install-extension gitscribe-1.0.0.vsix
```

## 技术说明

- 零运行时依赖：HTTP 使用 Node 18+ 内置 `fetch`（60s 超时，429/5xx 自动重试一次）
- Git 交互全部通过 VSCode 内置 `vscode.git` 扩展 API（`diffIndexWithHEAD` 获取暂存区真实 diff，无 HEAD 时回退到 `repository.show()` 构造），不 spawn git 进程
- esbuild 单文件打包（`dist/extension.js`）

## 发布

推送版本 tag 会触发 GitHub Actions 发布流程（构建并附带 `.vsix`）：

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
