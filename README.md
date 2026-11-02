# Engagement Exchange

Task-exchange platform where advertisers fund social media campaigns and performers complete tasks that are verified automatically.

## Layout

- `packages/verification`: verification library. Domain types, the source contract, the fallback chain and the source adapters.
- `apps/cli`: command-line driver for the verification library.
- `docs/plan`: phase plans.

## Toolchain

Node 26 (pnpm installs it from `devEngines`), pnpm 12, Turborepo, TypeScript, ESLint, Prettier, Vitest.

```sh
pnpm install
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm format
```

Copy `.env.example` to `.env` and fill in the values before running anything that calls a provider.
