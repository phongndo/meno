# meno

TypeScript project using the [Pi SDK](https://www.npmjs.com/package/@earendil-works/pi-coding-agent), pnpm, Oxlint, and Oxfmt.

## Requirements

- Node.js 22.19 or newer
- pnpm 11.13 or newer
- A Pi-supported provider configured through `pi /login` or an API key such as `ANTHROPIC_API_KEY`

## Commands

```sh
pnpm install
pnpm dev -- "What files are in this directory?"
pnpm build
pnpm start -- "What files are in this directory?"
pnpm check
pnpm format
pnpm lsp
```

`pnpm lsp` starts `typescript-language-server` over stdio for editor integrations.
