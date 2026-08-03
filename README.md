# Git Scribe

**English** | [简体中文](./README.zh-CN.md)

A VS Code extension that generates Git commit messages with configurable multi-provider AI models.

## Features

- **One-click commit messages**: reads the staged unified diff; if the index is empty, stages all working-tree changes first, then fills a Conventional Commits message into the SCM input box
- **Multi-provider management**: add / edit / delete any number of providers (Base URL, API Key, API format, models)
- **Quick active model switch**: pick the current provider and model from dropdowns at the bottom of the settings sidebar only
- **Three API formats**:
  - OpenAI Chat Completions (`/chat/completions`) — DeepSeek, Kimi, Zhipu GLM, Tongyi, and most OpenAI-compatible APIs
  - OpenAI Responses (`/responses`)
  - Anthropic Messages (`/v1/messages`) — including Anthropic-compatible gateways
- **Per-model context size**: each model has its own context window (default 1M tokens), set when adding the model
- **Generation settings**: choose commit language (Chinese / English) and customize the System Prompt, with one-click restore to defaults
- **Smarter default prompt**: small changes stay short; larger changes use a short summary plus Markdown bullet list (`- item`)
- **Connection test**: verify Base URL / API Key / format / model before saving
- **Secure storage**: API keys in VS Code SecretStorage; provider config in `globalState` (not `settings.json`)

## Usage

1. Command Palette (`Ctrl+Shift+P`) → **Git Scribe: 配置模型供应商**
2. Add a provider (name, Base URL, API Key, API format)
3. Add models with optional per-model context size (default 1M tokens), then save
4. Select the active provider/model from the sidebar bottom dropdowns
5. In a Git repository, make your changes (optional: `git add` first)
6. Click the generate button on the SCM title bar, or press `Ctrl+Alt+G` / run **Git Scribe: 生成提交信息**
7. Review the message in the SCM input box, then commit

If nothing is staged, Git Scribe stages all working-tree changes automatically, then generates the message.

### Settings entry points

| Entry | How |
|-------|-----|
| Command Palette | `Ctrl+Shift+P` → **Git Scribe: 配置模型供应商** |
| SCM menu | Git panel repository `...` → **Git Scribe: 配置模型供应商** |
| On generate | if not configured, click **去配置** in the warning |

In the settings panel:

- Left: provider list + **生成设置**
- Bottom: **当前供应商** / **当前模型** (the only place to switch active usage)
- Provider form: model list with per-model context size
- **生成设置**: commit language + System Prompt

## Local development

```bash
npm install
npm run compile        # esbuild bundle → dist/
npm run type-check     # tsc type check
npm run package        # production build (minified)
npm run build          # type-check + production build
```

Press `F5` to launch the Extension Development Host.

### Icons

```bash
node scripts/make-icon.js
```

Regenerates transparent-background icons from `resources/source-icon.png`.

### Package a VSIX

```bash
npm run package
npx vsce package --no-dependencies
```

Install with **Extensions: Install from VSIX...**, or:

```bash
code --install-extension git-commit-scribe-1.0.0.vsix
```

## Technical notes

- Zero runtime dependencies: HTTP via Node 18+ built-in `fetch` (60s timeout; one automatic retry on 429/5xx)
- All Git access goes through the built-in `vscode.git` extension API (`diffIndexWithHEAD`, `add`, `show`); no git process is spawned
- Single-file esbuild bundle (`dist/extension.js`)

## Release

Push a version tag to trigger the GitHub Actions release workflow (builds and attaches a `.vsix`):

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
