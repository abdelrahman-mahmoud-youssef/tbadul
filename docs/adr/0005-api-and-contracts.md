# ADR 0005: HTTP API and shared contracts

Status: accepted.

## Context

The contexts are packages with public surfaces and a CLI driver. A web app needs an HTTP API with sessions, roles and stable machine-readable errors, and both sides need one definition of every request, response and error. Versions verified on 2026-11-07: NestJS 12.4.0 (ESM only), `@nestjs/platform-fastify` 12.4.0 on Fastify 5.12.8, `better-auth` 1.7.15, `@fastify/rate-limit` 11.2.2, Zod 4.

## Decisions

### Contracts

- `packages/contracts` depends on Zod only. It holds a schema for every request body, path parameter and response, and the error envelope `{ error: { code, details? } }`, with inferred types. The API and the web app import it; neither redefines a shape.
- Errors carry a stable `code` and structured `details` only, never user-facing text. The web app owns the wording of every code. The codes are `cooldown_active` (retry time), `eligibility_failed` (claim id and every rule result), `limit_reached`, `account_owned_elsewhere`, `account_already_linked`, `account_unavailable`, `pool_exhausted`, `claim_expired`, `claim_not_found`, `claim_not_verifiable`, `claim_not_cancellable`, `invalid_handle`, `source_unavailable`, `conflict`, `unauthorized`, `forbidden`, `validation_failed`, `rate_limited`, `not_found` and `internal`.
- The contract restates the domain vocabularies (platforms, claim states, rule names, outcomes, roles, source names) as Zod enums so it stays free of workspace dependencies. A type-level test in the API holds each one equal to the domain's.

### API

- `apps/api` runs NestJS on Fastify under the global prefix `/api`. Controllers parse input with the contract schemas through Nest's Standard Schema pipe, call a context's public surface and map the result; the serializer parses every response with its contract schema. No domain rule lives in a controller.
- Domain errors map to contract codes in one place in the API; the HTTP status follows from the code.
- `composeApi` is the one composition root: database, named sources and planned orders, one verifier with timeouts, per-source bulkheads, daily budgets, the profile cache and spend ledger, and sinks that log every attempt and count fallbacks.
- Configuration is parsed once with Zod at startup. Startup refuses an unreachable database or a schema behind the migrations.

### Identity and access

- Better Auth handles email and password with cookie sessions under `/api/auth/*`, on the tables of ADR 0004, configured from the shared options in `packages/db`.
- A global guard resolves the session on every route; only `GET /api/health` is public. An admin guard requires the role `admin` from Better Auth's admin plugin. The CLI grants it.
- The web app reaches the API through a same-origin rewrite of `/api`, so session cookies stay first-party.

### Limits and logs

- Starting and verifying claims are rate-limited per user on top of the domain cooldown, answering `rate_limited` with the seconds to wait. The counter is in memory, for one process.
- Logs are pino JSON lines through Fastify, with cookies, authorization headers and request bodies redacted. Handles never appear in logs.

## Consequences

- A second API process needs a shared rate-limit store and shares the daily budget only through the seed read at the start of each day.
- Adding an error code is a contract change, an API mapping and a translation in the web app; the type checks fail until all three exist.
