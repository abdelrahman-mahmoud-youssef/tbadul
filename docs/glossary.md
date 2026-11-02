# Glossary: Verification context

The names below are the ubiquitous language of the Verification context. Code, tests, plans and conversations use them with exactly these meanings.

| Term             | Meaning                                                                                                                                                                    |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform         | A social network the system verifies on. A closed set; `tiktok` today.                                                                                                     |
| Handle           | The public username of an account on a platform, normalized (no `@`, no URL, lowercase). The identifier people type.                                                       |
| AccountId        | The platform's own stable identifier for an account, as returned by a source. TikTok calls it `secUid`. Never built from user input.                                       |
| ContentId        | The platform's identifier for a piece of content a task points at. For TikTok, the numeric video id.                                                                       |
| BioToken         | A platform-generated string a performer places in their bio to prove they control the account.                                                                             |
| Performer        | The account doing the task: the one whose following list or liked list is read.                                                                                            |
| Target           | What the task points at: the account to follow or the content to like.                                                                                                     |
| Check            | One question put to a source: `profile` of a handle, whether a performer `follows` a target, whether a performer `liked` a content item.                                   |
| CheckKind        | The name of a check: `profile`, `follows`, `liked`.                                                                                                                        |
| Outcome          | The closed set of answers: `verified`, `not_following`, `private`, `not_found`, `source_error`. For `profile`, `verified` means the profile was read.                      |
| Evidence         | The minimal facts that justify a `verified` or `not_following` outcome: the profile fields for `profile`, pages read and list exhaustion for list checks.                  |
| Source           | One way of answering checks for one platform: a scraper, a paid API, a fake in tests. Implements the `VerificationSource` port and declares which check kinds it supports. |
| SourceError      | Why a source could not answer: `timeout`, `network`, `http`, `auth`, `rate_limited`, `blocked`, `parse`, `unknown_status`, `unexpected`. Always yields `source_error`.     |
| Answer           | What one source returns for one check: an outcome with its evidence or error, plus what the call cost.                                                                     |
| Attempt          | The record of one source call made by the chain: source, check kind, outcome, error, cost, latency, start time.                                                            |
| Chain            | The ordered walk over sources for one check. Skips sources that do not support the check or serve another platform, falls through only on `source_error`.                  |
| Verdict          | The chain's final answer for a check: outcome, evidence or error, the source that answered, and every attempt made.                                                        |
| Verifier         | The public object the composition root returns: the use cases `verify` and `verifyOwnership`.                                                                              |
| Ownership        | The use case that reads a profile and decides whether the bio contains the token.                                                                                          |
| Decorator        | A wrapper around a source that adds behavior without the source knowing: the timeout today.                                                                                |
| Composition root | `createVerifier`: the one function that validates config and wires sources, decorators and use cases.                                                                      |
| Measurement      | The stream of attempts the chain reports to the `MeasurementSink` port; the CLI writes it to the log.                                                                      |
| Page cap         | The maximum number of list pages a source reads before answering `not_following` with `listExhausted` false.                                                               |
