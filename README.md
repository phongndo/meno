# Meno

A minimal Electron chat foundation powered by the pi SDK. It includes streamed responses, authenticated model selection, a sidebar, and a composer.

## Tooling

- pnpm
- Electron
- Effect 3
- Pi SDK (`@earendil-works/pi-coding-agent`)
- TypeScript and `typescript-language-server`
- Oxlint and Oxfmt

## Structure

```text
src/
├── main/
│   ├── ipc/
│   ├── services/
│   ├── window/
│   └── index.ts
├── preload/
├── renderer/
│   ├── components/
│   ├── lib/
│   ├── index.html
│   ├── index.ts
│   └── styles.css
└── shared/
resources/
scripts/
```

The main, preload, renderer, and shared boundaries follow the layout used by T3 Code and other Electron applications. Pi runs only in the main process; the sandboxed renderer receives a narrow, typed IPC API from the preload.

## Model setup

Meno reads models and credentials configured in pi's default agent directory (`~/.pi/agent`). Authenticate a provider before starting the app:

```bash
pi
/login
```

Environment-based provider API keys supported by pi also work. The current learning chat is in-memory and starts with tools, extensions, skills, and project context disabled.

## Development shell

```bash
nix develop
pnpm install
```

The flake provides Node.js, pnpm, hk, actionlint, nixfmt, Git, pkg-config, and Electron's Linux runtime libraries. It supports Apple Silicon/Intel macOS and ARM/x86-64 Linux.

## Git hooks

```bash
hk install --global # once per machine with Git 2.54+
# or: pnpm hooks:install
```

The pre-commit hook formats and checks staged files with Oxfmt, Oxlint, TypeScript, nixfmt, and actionlint. The pre-push hook runs the full project check and build.

## CI

GitHub Actions runs the pnpm checks/build and validates the Nix flake and hk configuration on pushes to `main` and pull requests.

## Commands

```bash
pnpm dev
pnpm build
pnpm check
pnpm lsp
pnpm hooks:check
nix fmt
nix flake check
```

`effect` is on the latest v3 release. The current npm `beta` tag is Effect 4, so this scaffold remains on the requested v3 line.
