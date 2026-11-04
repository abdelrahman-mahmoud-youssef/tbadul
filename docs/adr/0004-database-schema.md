# ADR 0004: Database schema for identity, linked accounts and the account cache

Status: accepted.

## Context

Persistence is in-memory plus a JSON claims file. The platform needs users, proven account ownership, a cache that stops paying twice for the same profile, and an audit trail of every ownership check. The stack is decided: PostgreSQL, Drizzle ORM with generated and reviewed migrations, Better Auth for users and sessions, Testcontainers for database tests. Versions verified on 2026-11-03: PostgreSQL 18.6 (native `uuidv7()`; 19 is a release candidate), `drizzle-orm` 0.45.4 and `drizzle-kit` 0.31.11 (1.0 is a release candidate), `pg` 8.23.1, `better-auth` 1.7.15, `@testcontainers/postgresql` 12.2.1.

The schema follows the domain. Tables exist only for contexts that exist: identity, Social Accounts and the Verification account cache.

## Decisions

### Layout

- `packages/db` holds the Drizzle client, the schema, the migrations, the migrate script and a Testcontainers harness published as `@engagement-exchange/db/testing`. It imports no context package, so no workspace cycle forms; it keeps its own list of platform values, and a test on the adapter side asserts it equals the Verification context's `platforms`.
- Each context keeps its repository adapters in its own `adapters` layer (`adapters/drizzle/`). The boundary lint policy allows `@engagement-exchange/db` from `adapters`, `testing` and the composition root only, never from `domain`, `ports` or `application`.
- Driver: `pg` (node-postgres), mature and the peer Better Auth names, over `postgres` 4.0.0, a major released days ago.

### Ids and types

- Every table this repo owns has a `uuid` primary key with default `uuidv7()`: time-ordered, so inserts stay local in the index.
- Platform account ids (TikTok's `secUid`) and any numeric platform id are `text`, never numbers: they exceed JavaScript's safe integer range and are opaque.
- Platform is `text` with a named check constraint, not a Postgres enum. `ALTER TYPE ... ADD VALUE` cannot run in a transaction block with other uses of the value and cannot be undone; replacing a check constraint is one transactional migration. Adding instagram, x, youtube, telegram, snapchat or facebook is a migration that drops and re-adds the constraint.
- States, outcomes and statuses are `text` with check constraints for the same reason.
- Timestamps are `timestamptz`. Counts are `integer`.

### Identity

Better Auth owns its tables and generates them with its own CLI (`auth generate --adapter drizzle --dialect postgresql`) from one options object in `packages/db`, which the future API reuses at runtime. The generated file is never edited by hand. Its tables are renamed with `modelName` to `auth_users`, `auth_sessions`, `auth_accounts` and `auth_verifications`, so Better Auth's credential `account` table can never be confused with a social account. Better Auth generates its own ids (`generateId: "uuid"`, random UUIDs); this is the one recorded exception to UUIDv7, because regenerating must stay mechanical. `linked_accounts.user_id` has the same type as `auth_users.id`.

Email is unique regardless of case through a unique index on `lower(email)` (`auth_users_email_lower_unique`), written in a custom migration (`0005`) beside Better Auth's own unique constraint on `email`. Better Auth 1.7.15 lowercases email on every write and lookup, so the index never refuses its writes and it keeps querying `email` by equality; the index refuses a case variant written by any other path. `citext` was rejected: the column type lives in the generated schema, so regenerating would revert it and `drizzle-kit` would emit a migration back to `text`. The index lives outside the generated file for the same reason.

### Tables

| Table                   | Purpose                                           | Key constraints                                                                                                                          |
| ----------------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `platform_accounts`     | One row per real account; the profile cache       | unique `(platform, external_id)`; index on `(platform, lower(handle))`, not unique                                                       |
| `linked_accounts`       | A user's proven ownership                         | unique `(platform_account_id)` where `status = 'active'`; index on `user_id`                                                             |
| `account_claims`        | The claim state machine                           | unique `(user_id, platform_account_id)` where `state = 'awaiting_follow'`; index on `(user_id, platform)`; `version` for compare-and-set |
| `claim_attempts`        | Append-only audit of verify attempts              | foreign key to the claim; updates and deletes refused by trigger                                                                         |
| `verification_accounts` | The pool of accounts to follow                    | unique `platform_account_id`; `active`; `assigned_count`                                                                                 |
| `verification_checks`   | Append-only log of every check, for cost tracking | BRIN index on `at`; updates and deletes refused by trigger                                                                               |

`platform_accounts` carries the platform, `external_id`, an optional `numeric_id`, the current `handle` and `handle_seen_at`, privacy (`is_private`, `following_visible`, `likes_visible`), stats (`follower_count`, `following_count`, `video_count`), `account_created_at`, `avatar_url`, `profile_fetched_at`, `profile_source` and `extras` (`jsonb`) for platform-specific fields. A handle is not identity: it changes and gets reused, so it is indexed but never unique, and claims, links and the pool reference the account by its row id. `account_claims.verification_handle` is a snapshot of the handle the user was told to follow, taken at assignment, so the claim still names it after the handle moves to another account. It is a display label only: link start's baseline and link verify pass the verification account's `external_id` as the follows check's `targetId`, and the source matches the list by that id.

`verification_checks` stores the check kind, platform, source, outcome, error kind, latency, cost unit and amount, and HMAC-SHA256 hashes of the handles involved, never a raw handle. Its error kinds follow the domain's closed list, `unsupported` included (migration `0004`). It only grows and is read by time range, so a BRIN index on `at` costs almost nothing. Partitioning plan: when it passes about 10 million rows, convert it to monthly range partitions on `at`; the primary key then becomes `(id, at)`, because a partitioned table's unique keys must include the partition key; retention drops whole partitions.

Append-only is enforced in the database: a trigger refuses `UPDATE` and `DELETE` on `claim_attempts` and `verification_checks`, written as a custom migration.

### Ownership and the platform limit

- **Ownership is exclusive at verify, not at start.** Today an open claim blocks every other user, so anyone could squat an account for a claim's lifetime. Several users may hold open claims on one account; only one may hold it verified. The partial unique index on `linked_accounts` settles the race: the verify transaction inserts the link, and a unique violation on that index, recognised by constraint name, maps to the existing `account_already_claimed` refusal. This is a domain change.
- **Expired claims stop counting.** An `awaiting_follow` claim counts toward the limit only while it has not expired, in the domain and in SQL. Today five abandoned claims lock a user out until each is touched. This is a domain change.
- **The limit is enforced atomically.** Claim creation runs in one transaction that takes `pg_advisory_xact_lock` on a key derived from the user and the platform, counts active links plus unexpired open claims from the tables themselves, and inserts only below the limit, which comes from config as a parameter. A counter row was rejected: it must change in step with every transition, and expiry is lazy, so it would drift. The cheap count the use case makes stays, as cost avoidance, not as the check: it runs after the owner and open-claim lookups, so a user at the limit who starts their own open claim again gets it back, and before eligibility and the paid baseline calls.

### Port changes in Social Accounts

- `AccountClaim` gains `version`. The repository's save becomes compare-and-set: it takes the claim with its expected version and returns a conflict when the stored version differs. The in-memory adapter honours the same contract.
- Claim creation becomes one repository operation that takes the limit and returns `limit_reached` or a stored claim.
- Verifying a claim becomes one repository operation that saves the claim and creates the link, returning `account_already_claimed` when another user's link exists.
- The holder lookup reads active links, not open claims.
- `VerifyAttempt` gains the source and latency of the check, so `claim_attempts` can record them.
- The pool gains a method that records an assignment, so `assigned_count` spreads assignments evenly; candidates come out least assigned first. A candidate carries its handle and its account id, both required; the assignment, the claim's `verification_platform_account_id` and the follows check follow the id, never the handle. The config pool takes candidates with ids; the CLI's in-memory link start resolves each handle it is given through a profile check first.

### The resolution cache

- A `ProfileCache` port in the Verification context sits in front of the profile check, inside `createVerifier`, so account linking and future campaign targets share it through the public surface.
- Lookup by account id: the row's id never expires; its privacy and stats expire after `statsTtlMs`.
- Lookup by handle: a handle-to-id mapping, fresh only while `handle_seen_at` is within `handleTtlMs`; a handle matching more than one row is a miss.
- A caller may demand fresher data for one call (link start's eligibility does); the verify path reads lists by account id and never needs a profile.
- On a miss the chain answers and the row is upserted on `(platform, external_id)`; a handle now seen on a different account id is cleared from the old row.
- A hit is recorded as an attempt from the source `cache` with no cost, so the measurement output counts hits and misses.
- Only a `verified` profile is stored; private, not found and source errors always reach the chain.
- Ownership proof reads the bio from the chain, never from the cache: the token was just added.

The check log adapter takes the attempt plus the command's subjects, as the CLI's JSONL log does, and stores their HMAC-SHA256 hashes, so the measurement sink port is unchanged.

### Decisions for contexts not built yet

- Money is `bigint` minor units plus an ISO 4217 currency code, wrapped in a `Money` value object; never `numeric` floats or JavaScript floating point.
- The ledger is append-only double entry: journal entries with postings whose amounts sum to zero per currency, enforced in the database; corrections are reversing entries, never updates.
- A task execution is unique per campaign and linked account, enforced by a unique constraint.

### Operations

- Migrations are generated by `drizzle-kit generate`, reviewed and committed; `drizzle-kit push` is never used. A migrate script applies them. The CLI does not migrate on start; it prints one line when the schema is missing.
- Database tests start one `postgres:18` container per package in a Vitest global setup and apply the migrations; when Docker is unreachable they skip with one line saying so.
- The CLI uses the database when `DATABASE_URL` is set; the claims file is removed. With a database, the verification account pool lives in `verification_accounts`, filled by a CLI command.

## Consequences

- Every uniqueness and limit rule has a database guarantee, not only application code.
- Adding a platform is one migration on a check constraint.
- A profile resolved once is served from the cache until it expires, so repeated link starts and campaign targets stop paying for the same account.
