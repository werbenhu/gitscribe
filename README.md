# Git Scribe

**English** | [简体中文](./README.zh-CN.md)

A VS Code extension that generates Git commit messages with configurable multi-provider AI models.

## Features

- **One-click commit messages**: reads the real unified diff of the staged changes; if the index is empty, stages all working-tree changes first, then generates a Conventional Commits message and fills the SCM input box
- **Multi-provider management**: sidebar provider list + form UI; add / edit / delete any number of providers
- **Three API formats**:
  - OpenAI Chat Completions (`/chat/completions`) — works with DeepSeek, Kimi, Zhipu GLM, Tongyi, and most OpenAI-compatible services
  - OpenAI Responses (`/responses`)
  - Anthropic Messages (`/v1/messages`)
- **Configurable System Prompt**: customize Chinese / English prompts, with one-click restore to defaults
- **Connection test**: verify Base URL / API Key / format / model before saving
- **Chinese & English messages**: switch generation language under **Generation** in settings
- **Secure storage**: API keys in VS Code SecretStorage (OS-level encryption); provider config in `globalState`, not `settings.json`

## Usage

1. Command Palette (`Ctrl+Shift+P`) → **Git Scribe: Configure Model Providers** — add a provider, enter the API Key, then click **Use** on a model to set it as active
2. In a Git repository, make your changes (optional: `git add` first)
3. Click the generate button on the SCM title bar (or `Ctrl+Alt+G` / command **Git Scribe: Generate Commit Message**)
4. If nothing is staged, all working-tree changes are staged automatically, then a message is generated and filled into the input box — review and commit

### Settings entry points

| Entry | How |
|-------|-----|
| Command Palette | `Ctrl+Shift+P` → **Git Scribe: Configure Model Providers** |
| SCM menu | Git panel repository `...` → Configure Model Providers |
| On generate | if not configured, click **Configure** in the warning |

In the settings panel, open **Generation** on the left to set language and System Prompt.

## Local development

```bash
npm install
npm run compile        # esbuild bundle → dist/
npm run type-check     # tsc type check
npm run package        # production build (minified)
```

Press `F5` to launch the Extension Development Host.

### Package a VSIX

```bash
npm run package
npx vsce package --no-dependencies
```

Install with **Extensions: Install from VSIX...**, or:

```bash
code --install-extension gitscribe-1.0.0.vsix
```

## Technical notes

- Zero runtime dependencies: HTTP via Node 18+ built-in `fetch` (60s timeout; one automatic retry on 429/5xx)
- All Git access goes through the built-in `vscode.git` extension API (`diffIndexWithHEAD` for staged unified diffs; falls back to `repository.show()` when there is no HEAD). No git process is spawned
- Single-file esbuild bundle (`dist/extension.js`)

## Release

Push a version tag to trigger the GitHub Actions release workflow (builds and attaches a `.vsix`):

```bash
git tag v1.0.0
git push origin v1.0.0
```

## License

MIT
