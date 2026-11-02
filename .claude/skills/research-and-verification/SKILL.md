---
name: research-and-verification
description: Verify facts about external providers, platforms, packages and tools against primary sources and mark each one confirmed or unconfirmed. Use whenever a plan, document or decision depends on how a third party behaves, costs or is licensed.
---

# Research and verification

A fact about anything outside this repo is unverified until a primary source says it. Marketing pages, blog posts, forum answers and model memory are leads, not evidence.

## Primary sources, by kind of fact

| Fact                                                   | Primary source                                                                                                    |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Package version, publish date, license, engines, peers | `npm view <pkg> version time license engines peerDependencies --json`                                             |
| Repository activity, license, stars, open issues       | GitHub API: `https://api.github.com/repos/<owner>/<repo>` and `/commits?per_page=1`                               |
| API endpoints, auth, parameters                        | The provider's OpenAPI spec or official reference page, fetched and quoted                                        |
| Pricing, limits, free tier                             | The provider's pricing page, quoted with the date read                                                            |
| Platform behavior (status codes, payload fields)       | A request made against the platform, or the source of a maintained open-source client, named by file and behavior |
| Tool configuration formats                             | The tool's current documentation page, not a remembered format                                                    |

## Procedure

1. Write the claim as one sentence that can be true or false.
2. Fetch the primary source. Quote the exact text or field that supports or contradicts it.
3. Mark it:
   - `CONFIRMED` with the source URL and the date read.
   - `PARTIALLY CONFIRMED` when part of the claim holds; say which part is still open.
   - `UNCONFIRMED` when no primary source was reachable; say what was tried.
   - `REFUTED` with the contradicting quote.
4. A claim that could not be checked stays `UNCONFIRMED` in the document. Never soften the wording to make it sound settled.

## Writing it down

In plans and docs, every external fact carries its mark and a link inline:

```
LamaTok authenticates with an `x-access-key` header. CONFIRMED, https://api.lamatok.com/openapi.json, read 2026-11-02.
```

Facts that change (prices, versions, rate limits) carry the date read. Facts taken from open-source code name the repo, file and the behavior observed, and are at most `PARTIALLY CONFIRMED` until seen against the platform itself.

## Blocked sources

TikTok pages answer automated fetches with a bot interstitial. Do not try to circumvent it. Record the block, fall back to maintained client source code for the field names, and mark the result `PARTIALLY CONFIRMED`.
