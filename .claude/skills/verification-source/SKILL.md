---
name: verification-source
description: Add or change a verification source (scraper or paid API) behind the VerificationSource port in packages/verification. Use when implementing an adapter, mapping a provider response to outcomes, or recording a source's cost and latency.
paths:
  - packages/verification/src/adapters/**
---

# Adding a verification source

A source is an adapter behind the `VerificationSource` port in `src/ports/verification-source.ts`. The chain, the use cases and the tests never see provider payloads, only the closed outcome set. ADR 0001 (`docs/adr/`) fixes the layers, `docs/glossary.md` fixes the names, and `docs/plan/phase-1-tiktok-verification.md` section 3.4 shows the contract. Read those three before writing code and keep their names.

## 1. Place the files

```
packages/verification/src/adapters/<provider>/
  <provider>-source.ts        defineSource(identity, handlers)
  <provider>-client.ts        HTTP only: auth header, base URL, signal forwarding, raw JSON
  <provider>-schemas.ts       Zod schemas for the provider payloads actually used
  <provider>-source.test.ts   one test per row of the mapping table, plus failure paths
  fixtures/                   sanitized recorded responses, one file per case
```

Shared pieces stay shared and live under `src/adapters/`: the HTTP client wrapper, pagination helpers, the resilience decorators. Search `src/adapters` and `src/domain` before adding anything that looks generic. The layer rule is enforced by lint: an adapter may import `domain` and `ports`, nothing else inside the package, and only adapters may import `cockatiel`.

## 2. Implement the port

- Build the source with `defineSource({ name, platform }, handlers)` from `src/adapters/define-source.ts`. Give a handler only for the check kinds the provider can answer; `supports` is derived from the handlers and the chain skips the rest.
- Each handler receives the typed check (`subject`, or `performer` plus `target` or `content`) and a `CallContext` with `signal` and `pageCap`. Forward `signal` to every `fetch`. Never read more than `pageCap` pages.
- Parse every provider response with its Zod schema in the client. Handlers receive typed values, never `unknown`.
- Return an `Answer`: `verified` or `not_following` with evidence and cost, `private` or `not_found` with cost, or `failed(error, cost?)` from `src/domain/answer.ts`. Build `AccountId` with `accountId(platform, value)`. Do not measure latency; the chain does.
- Do not wrap the source in `withTimeout` yourself. The composition root does.

## 3. Map to the closed outcome set

| Provider situation                                                                            | Outcome                                                                                       |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Target found in the relevant list, or the profile was read                                    | `verified` with `ListEvidence` or `ProfileEvidence`                                           |
| List read to completion or to `pageCap` and target absent                                     | `not_following` with `pagesRead` and `listExhausted`                                          |
| Provider says the list or account is hidden or private                                        | `private`                                                                                     |
| Account, content or handle does not exist                                                     | `not_found`                                                                                   |
| Timeout, network error, 5xx, 429, auth failure, bot wall, unparseable payload, unknown status | `failed({ kind, message, httpStatus?, providerStatus? })` with the matching `SourceErrorKind` |

An unknown provider status code is `unknown_status`, never `not_following`. Add a code to the mapping only after the research skill has confirmed its meaning. `unexpected` is reserved for the chain: a handler that throws is recorded with that kind, so throw only for programmer errors.

## 4. Record cost

Set `cost` on every answer that reached the provider. For a paid API, read the charged units from the response when the provider returns them (EnsembleData returns `unitsCharged`, unit `units`); otherwise count requests (unit `request`) and note the per-request price from the provider's pricing page in the plan's measurement table. Omit `cost` on a failure that never reached the provider.

## 5. Test

- One test per row of the mapping table, driven by a fixture file. Fixtures are recorded once from a real call, then stripped of tokens, cookies and personal data before being committed.
- An unknown status code yields `unknown_status`; an unparseable body yields `parse`; an HTTP failure carries `httpStatus`.
- A pagination test where the target sits on a later page, and one where `pageCap` stops the read with `listExhausted` false.
- A test that the handler forwards `context.signal` to the client.
- Live tests against the real provider run only when the provider's key name is present in the environment and are skipped otherwise. Use the fakes in `src/testing/` for everything else.

## 6. Register

Export the source factory from `src/index.ts`. The CLI builds the source with its credential and passes it in `deps.sources` to `createVerifier`; the name you give `defineSource` is the name `VERIFICATION_SOURCE_ORDER` uses. Add the name to the plan's source table with the measured cost and latency.
