# ADR 0003: Source order per check kind

Status: accepted.

## Context

ADR 0001 gives the chain one order of sources for every check. Two measurements make one order wrong:

- TikTok's profile page refuses automated clients from an IP it has flagged. Plain fetch with the signer identity's cookies passed for about 20 loads on 2026-11-02 and was then refused, and it was still refused from the same IP on 2026-11-03. The sidecar's headless Chromium was refused from that IP too (fact 33). A regular desktop browser on the same connection loaded the page normally (fact 43), and the same scraper passed again from a new IP (fact 44). So the refusal is neither IP-wide nor tied to the client alone: an IP gets flagged after about 20 automated profile loads, and from then on automated clients from it are refused. A production fleet resolving handles at scale would flag every IP it uses at that rate; keeping the profile page usable would mean rotating IPs continuously, which datacenter ranges make harder, not easier.
- The signed following and liked lists, read by account id, answered every call from the same machine (fact 41). They cost one signed request per page and need no profile page when the check carries `performerId`.

So the scraper is a poor profile resolver and a good list reader, and the paid sources are the reverse in cost: a profile read is cheap for them, a list read is billed per page.

## Decision

The verifier takes one order per check kind: `{ profile, follows, liked }`. Each is a non-empty list of source names without duplicates, validated once with Zod at the composition root; an unknown name fails at creation. The chain walks the list for the check's kind and nothing else changes: it still skips a source that does not support the kind, falls through only on `source_error`, and records every attempt.

The defaults, set in configuration and not in code:

| Check kind | Order                                 | Reason                                                                                                  |
| ---------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `profile`  | `tokapi, ensemble, scraper`           | Handle-to-id resolution through a paid source; the profile page last.                                   |
| `follows`  | `scraper, tokapi, ensemble, scraptik` | One signed list call by account id; paid sources confirm a `not_following`, cheapest per request first. |
| `liked`    | `scraper, ensemble`                   | Same as `follows`; Tokapi and ScrapTik answer follows only.                                             |

Changed on 2026-11-06 from `lamatok, ensemble, scraper` for profile and `scraper, lamatok, ensemble` for follows and liked, after the provider evaluation in the plan's section 6.3: LamaTok is unfunded and its list shapes are unrecorded, so it leaves the defaults; ScrapTik joins follows as the backup confirmer.

Changed on 2026-11-20 for follows, after the RapidAPI evaluation in the plan's section 6.5: Tokapi reads the same TikTok app list by account id for a fraction of EnsembleData's and ScrapTik's price per page, so it takes the first paid place and confirms the scraper's `not_following`. Its profile route returns the ids, the privacy flags and the following visibility, and its posts route the latest post, so it also leads the profile order.

Callers that read a list resolve the performer through a profile check first and pass the resulting `AccountId` as `performerId`, so the scraper never loads a profile page on the list path. A profile page load can still happen when every paid source fails a profile check, because the scraper is the last profile source by design; that is a fallback, not part of the list path.

The CLI reads the orders from `VERIFICATION_SOURCE_ORDER_PROFILE`, `VERIFICATION_SOURCE_ORDER_FOLLOWS` and `VERIFICATION_SOURCE_ORDER_LIKED`, each falling back to `VERIFICATION_SOURCE_ORDER` and then to the defaults above. A source whose credential is not configured is left out of every order, and the CLI says so once at startup.

Changed on 2026-11-07: the defaults above, the closed list of source names, the planning that leaves out a source without a credential, and the construction of the named sources from their credentials live in `packages/verification` as `defaultSourceOrders`, `knownSourceNames`, `planSourceOrders` and `assembleSources`, so every app builds the same chain the same way. Each app keeps its own environment parsing with Zod: it reads the overrides and credentials, passes them in, and words the refusals for its own output.

## Consequences

- Moving a source up or down for one kind is a configuration change.
- The cost of a follow check is one profile resolution, billed by a paid source, plus one free signed list call; repeated checks on a stored claim or execution skip the profile entirely.
- If the signed list endpoints start refusing automated clients the way the profile page does, the follows and liked orders change to put the paid sources first, with no code change.
