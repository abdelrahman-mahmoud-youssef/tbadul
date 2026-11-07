# ADR 0001: Structure of the Verification context

Status: accepted.

## Context

The platform will be split into bounded contexts: Verification, Social Accounts, Campaigns, Tasks, Ledger, Payments, Trust and Safety. `packages/verification` is the Verification context and nothing else. It answers one question, "did this performer do this task on this platform", from several unreliable sources, and it must keep answering when sources change, when TikTok rotates its signing, and when Instagram arrives.

## Decision

### Layers inside the package

```
packages/verification/src/
  domain/         value objects, the outcome model, Result, domain errors, pure rules
  ports/          interfaces the use cases depend on: VerificationSource, Clock, MeasurementSink
  application/    the verification use cases and the chain
  adapters/       implementations of ports: resilience decorators now, providers later
  testing/        in-memory fakes for tests
  create-verifier.ts   composition root
  index.ts             public surface
```

Dependencies point inward: `domain` imports nothing from the other layers; `ports` imports `domain`; `application` imports `domain` and `ports`; `adapters` imports `domain` and `ports`; `testing` imports `domain`, `ports` and `adapters`; the composition root imports everything. Test files may additionally import `testing`. No production file imports a test file or `testing`.

Ports sit in their own folder rather than inside `application` so that adapters can implement them without importing the use cases, and so the layer rule can be expressed per folder.

### Tactical patterns and why each one is here

- **Value objects** for `Platform`, `Handle`, `AccountId`, `ContentId`, `BioToken`. They are branded plain objects with a parse function, not classes: they carry no behavior beyond creation and equality, and plain objects serialize into logs and later into queue messages without ceremony. Each is parsed once with Zod at creation and never re-validated.
- **Result** for expected failures. Parsing user input is the one place in this package where failure is a normal path, so `parseHandle` and friends return `Result<T, InvalidInput>` instead of throwing. Everything downstream receives a valid value.
- **Strategy**: each `VerificationSource` is one way of answering a check. The chain does not know how a source answers.
- **Chain of responsibility**: the chain walks the configured sources and falls through only on `source_error`. ADR 0003 gives each check kind its own order. It is an application service, not a domain object, because its rules are about orchestration and cost, not about what a follow is.
- **Decorator** around a source for cross-cutting behavior. `withTimeout` is the only decorator now. Measurement is not a decorator: every attempt must appear in the verdict, so the chain has to record attempts anyway, and a second place computing the same numbers would be a duplicate. Retry is deferred: retrying a timeout doubles worst-case latency and retrying a rate limit makes it worse; the measurement log decides whether and where a retry policy earns its place.
- **Composition root**: `createVerifier(config, deps)` validates the config once with Zod, wraps each source with the decorators, and returns the use cases. Nothing else in the package reads configuration.

No aggregates and no repositories. This context holds no state: a verdict is an immutable value handed to the caller, and the record that a task was verified and paid belongs to the Tasks and Ledger contexts. If a re-check schedule ever needs persistent state inside this context, that is the moment to add an aggregate, with its own ADR.

### Platform as a first-class concept

`Platform` is a closed union, `'tiktok'` only for now. Every value object carries its platform, a source declares the platform it serves, and the chain only consults sources whose platform matches the check. Platform-specific rules (how a TikTok handle is written, how a video URL is parsed) live in `domain/platforms/<platform>.ts`. The contract itself names nothing TikTok-specific: evidence uses `accountId`, `bio`, `isPrivate`, `pagesRead`, `listExhausted`. Adding Instagram means one union member, one rules file and one or more adapters.

### Contract shape

One method per source, `answer(check, context)`, with `Check` as a discriminated union over the check kinds and the answer typed by kind. The alternative, one method per kind, would force the chain, every decorator and every fake to repeat the same three-way dispatch. The single method keeps decorators generic; adapters build their source from per-kind handlers through `defineSource`, so the one necessary cast lives in that helper and nowhere else.

A `follows` or `liked` check may carry the performer's `AccountId` (`performerId`). A source that can read the list by that id skips resolving the handle; for the scraper this removes the profile page load, the scarcest request. The handle stays required so that handle-only sources still work. Added on 2026-11-03 for account linking (ADR 0002).

A `follows` check carries the target's `AccountId` as `targetId`, and it is required. Every source matches a list entry by that id, never by handle: handles change and are reused, so a handle match could pass a follow of whoever holds the handle now for a follow of the account the caller resolved. The target `Handle` stays on the check as a display label. A source whose list entries carry no usable account id answers `source_error` with kind `unsupported` for follows instead of matching by handle. Added on 2026-11-04.

An `AccountId` may carry the platform's numeric id beside its primary value (`numericId`; TikTok's numeric `uid` beside the `secUid`). Identity stays the primary value; the numeric id is a second key that is as stable. Sources match list entries through one domain rule, `matchAccount`: an entry is the target when every id known on both sides agrees, another account when every such id differs, an `identity_conflict` source error when some agree and some differ, and an `unsupported` source error when no id is known on both sides. A conflict or an unmatchable entry is never a match and never `not_following`. Added on 2026-11-06.

The outcome set stays the five names given in the plan, including `not_following` for an absent like or an absent bio token. The vocabulary is frozen when the API phase starts; the plan carries the rename as an open question until then.

### Mechanical enforcement of the layer rule

`eslint-plugin-boundaries` 7.4.1 (MIT, about 1,000 stars, pushed 2026-11-02, peer `eslint >= 6`) enforces the import policy above as ordinary lint errors, in the existing `pnpm lint` task and in the editor. It classifies files by folder, resolves imports with the node resolver, and fails on an unknown file or an import across the policy.

Rejected alternatives:

- `dependency-cruiser` 18.7.1 (MIT, about 7,400 stars, pushed 2026-11-01). Capable, but it is a second tool with its own config, its own Turbo task and eighteen dependencies, and nothing it adds (cycle and orphan detection) is needed here.
- ESLint core `no-restricted-imports`. Matches import specifiers, not resolved files, so relative paths such as `../adapters/x.ts` need one pattern per folder depth and silently stop matching when a file moves. No element model, no "unknown file" check.

### Dependencies added by this decision

- `zod` for parsing at the boundaries. Used in `domain` for value objects and in the composition root for config. Allowing one validation library in the domain is a pragmatic choice recorded here; it is the only external import the domain may have.
- `cockatiel` for the timeout policy and, since 2026-11-07, the per-source bulkhead. Only `adapters` may import it.
- `fast-check` for property tests over sequences of source answers. The invariant "the chain never produces `not_following` unless a source produced it" is about arbitrary orderings and lengths, which example tables cover poorly.
- `eslint-plugin-boundaries` as above.

## Consequences

- Adding a source means one folder under `adapters/`, one `defineSource` call and tests; the chain, the use cases and the domain do not change.
- Adding a check kind means one `Check` variant, one evidence type, and handlers in the sources that support it. The type checker reports every switch that misses the new kind.
- Adding a platform means one union member, one rules file and adapters. Nothing in `application` or `ports` changes.
- The layer rule cannot be broken without a lint error, so a leak is caught in the editor before it reaches a commit.

## Amendment, 2026-11-07: batched follows checks

A source's follows handler takes a batch: one performer and several targets, each with its `AccountId`. It answers the whole batch from one following-list read, with one answer per target and the listed accounts it read. The public `Check` union is unchanged: a single follows check is a batch of one, so the chain and every adapter keep one follows code path. `Verifier.verifyFollowsBatch` returns one verdict per target; the confirmation, shorter-list and page-cap rules hold per target. One attempt is recorded per source call, carrying the least settled of the answers it gave.

The chain keeps each performer's last list read in memory for a short window and answers a target from it only when the target is in it. A miss reads live, so the cache can save a read but can never answer `not_following`.
