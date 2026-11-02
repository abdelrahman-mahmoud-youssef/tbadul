---
name: verification-source
description: Add or change a verification source (scraper or paid API) behind the VerificationSource contract in packages/verification. Use when implementing an adapter, mapping a provider response to outcomes, or recording a source's cost and latency.
paths:
  - packages/verification/src/sources/**
  - packages/verification/src/adapters/**
---

# Adding a verification source

A source is an adapter behind the `VerificationSource` port. The chain, the CLI and the tests never see provider payloads, only the closed outcome set. The contract is specified in `docs/plan/phase-1-tiktok-verification.md`, section "Source contract". Read that section first and keep the names used there.

## 1. Place the files

```
packages/verification/src/adapters/<provider>/
  <provider>-source.ts        implements VerificationSource
  <provider>-client.ts        HTTP only: auth header, base URL, timeout, raw JSON
  <provider>-schemas.ts       Zod schemas for the provider payloads actually used
  <provider>-source.test.ts   outcome mapping and error tests
  fixtures/                   sanitized recorded responses, one file per case
```

Shared pieces stay shared: HTTP client wrapper, timeout and retry policies, handle and ID value objects, pagination helpers. Search `packages/verification/src` before adding anything that looks generic.

## 2. Implement the port

- Declare which checks the source supports (`profile`, `follows`, `liked`). The chain skips a source for checks it does not support.
- Parse every provider response with the Zod schema at the client boundary. Downstream code receives typed values, not `unknown`.
- Every call goes through the shared timeout policy. No raw `fetch` without a signal.
- Return a `SourceResult` carrying `outcome`, `evidence` (the minimal fields that justify the outcome, such as the matched list entry), `source`, `cost`, `latencyMs` and `checkedAt`.

## 3. Map to the closed outcome set

| Provider situation                                                                  | Outcome         |
| ----------------------------------------------------------------------------------- | --------------- |
| Target found in the relevant list, or bio contains the token                        | `verified`      |
| List fully read (or read to the configured page limit) and target absent            | `not_following` |
| Provider says the list or account is hidden or private                              | `private`       |
| Account, video or handle does not exist                                             | `not_found`     |
| Timeout, network error, 5xx, 429, auth failure, unparseable payload, unknown status | `source_error`  |

An unknown provider status code is `source_error`, never `not_following`. Add a code to the mapping only after the research skill has confirmed its meaning.

## 4. Record cost and latency

Every `SourceResult` carries the numbers; the CLI appends them to the measurement log. For a paid API, read the charged units from the response when the provider returns them (EnsembleData returns `unitsCharged`); otherwise count one request per call and note the per-request price from the provider's pricing page in the plan's measurement table.

## 5. Test

- One test per row of the mapping table, driven by a fixture file. Fixtures are recorded once from a real call, then stripped of tokens, cookies and personal data before being committed.
- A timeout test using fake timers that asserts `source_error`.
- A pagination test where the target sits on a later page.
- A test that an unknown status code yields `source_error`.
- Live tests against the real provider run only when the provider's key name is present in the environment and are skipped otherwise.

## 6. Register

Add the source to the composition root under its name, and add the name to the documented values of `VERIFICATION_SOURCE_ORDER` in the plan. Update the plan's source table with the measured cost and latency.
