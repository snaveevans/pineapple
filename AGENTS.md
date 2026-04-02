# AGENTS.md

## Environment
- Node: 22.x (from package.json engines)
- Package manager: pnpm 10.28.2

## Common commands (run from repo root)
- `pnpm dev`: start API dev server (`apps/api`)
- `pnpm deploy`: deploy API (`apps/api`)
- `pnpm cf-typegen`: generate Cloudflare types (`apps/api`)
- `pnpm typecheck`: run API typecheck (`apps/api`)
- `pnpm test`: run API tests (`apps/api`)
- `pnpm lint`: run ESLint across repo
- `pnpm format`: run Prettier write
- `pnpm format:check`: run Prettier check
- `pnpm check`: cf-typegen + typecheck + lint + test + format:check

## TODO
- Add any app-specific workflows and environment setup details once confirmed in-repo docs.
