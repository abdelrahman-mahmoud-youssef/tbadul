# Engagement Exchange

Task-exchange platform where advertisers fund social media campaigns and performers complete tasks that are verified automatically.

## Layout

- `packages/verification`: verification library. Domain types, the source contract, the fallback chain and the source adapters.
- `packages/social-accounts`: account claims, eligibility, cooldown and the verification pool.
- `packages/contracts`: request and response schemas shared by the API and the web app.
- `packages/db`: PostgreSQL schema and migrations.
- `apps/api`: NestJS API on Fastify with Better Auth.
- `apps/web`: Next.js web app, Arabic and right-to-left.
- `apps/cli`: command-line driver.
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
pnpm test:e2e
```

## Run everything locally

Prerequisites: a `.env` copied from `.env.example`, a PostgreSQL 18 database that `DATABASE_URL` points to, and the TikTok signer sidecar answering at `TIKTOK_SIGNER_URL`.

```sh
pnpm start
```

`pnpm start` builds the API and the web app, applies the migrations, then serves the API on port 4000 and the web app on port 3000. Open http://localhost:3000.

### Become an admin

Register in the web app, then promote the account:

```sh
pnpm --dir apps/cli dev user role you@example.com admin
```

Sign out and in again. The administration page, where verification accounts are added and deactivated, then appears in the navigation.

## Environment

Keys read from `.env` (names only; `.env.example` lists them all):

| Needed to run         | Keys                                                                                                                                          |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Database and sessions | `DATABASE_URL`, `BETTER_AUTH_SECRET` (32 characters or more)                                                                                  |
| Origins               | `PUBLIC_WEB_ORIGIN`, `API_ORIGIN`, `CORS_ORIGINS`, `API_PORT`, `API_HOST`                                                                     |
| Signer                | `TIKTOK_SIGNER_URL`                                                                                                                           |
| Paid sources          | `ENSEMBLEDATA_TOKENS`, `RAPIDAPI_KEY`, `LAMATOK_ACCESS_KEY`                                                                                   |
| Daily source caps     | `ENSEMBLEDATA_DAILY_UNITS`, `TOKAPI_DAILY_REQUESTS`, `SCRAPTIK_DAILY_REQUESTS`, `LAMATOK_DAILY_REQUESTS`                                      |
| Source orders         | `VERIFICATION_SOURCE_ORDER`, `VERIFICATION_SOURCE_ORDER_PROFILE`, `VERIFICATION_SOURCE_ORDER_FOLLOWS`, `VERIFICATION_SOURCE_ORDER_LIKED`      |
| Confirmation rules    | `VERIFICATION_CONFIRM_NOT_FOLLOWING`, `VERIFICATION_CONFIRM_NOT_FOUND`                                                                        |
| Limits                | `AUTH_ATTEMPTS_PER_MINUTE`, `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`, `VERIFICATION_CONCURRENCY`, `VERIFICATION_QUEUE`, `OUTBOUND_TIMEOUT_MS` |
| Logging and privacy   | `LOG_LEVEL`, `MEASUREMENT_HMAC_KEY`                                                                                                           |
| CLI only              | `CLI_USER_ID`, `VERIFICATION_ACCOUNTS`, `MEASUREMENT_LOG_FILE`, `WATCH_INTERVAL_SECONDS`                                                      |
| End-to-end tests      | `E2E_API_PORT`, `E2E_CONTROL_PORT`, `E2E_WEB_ORIGIN`                                                                                          |

At least one of `ENSEMBLEDATA_TOKENS` or `RAPIDAPI_KEY` is needed to confirm a `not_following` answer from the scraper with a second source. `SCRAPTIK_RAPIDAPI_KEY` is still read when `RAPIDAPI_KEY` is unset.
