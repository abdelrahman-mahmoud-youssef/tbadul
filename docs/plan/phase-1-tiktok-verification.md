# Phase 1: TikTok verification

External facts in this document carry a mark: CONFIRMED (primary source quoted), PARTIALLY CONFIRMED (part of the claim holds, the rest is open), UNCONFIRMED (no primary source reached) or REFUTED. All sources were read on 2026-11-02. Section 11 lists every fact with its mark.

## 1. Scope

Phase 1 delivers the verification capability for TikTok as a library plus a command-line driver, and nothing else.

In scope:

- Given a performer handle and a target account, decide whether the performer follows the target.
- Given a performer handle and a target video, decide whether the performer liked the video.
- Read a performer's profile (secUid, bio, privacy flags) and decide whether the bio contains an ownership token.
- Re-run a follow or like check later to catch an unfollow or an unlike.
- Obtain these answers from several sources behind one contract, tried in a configurable order.
- Record cost, latency and outcome for every source call so the next phase can pick the default order with numbers.

Out of scope: database, users, wallet, UI, queues, HTTP API, other platforms. The library must be the one the NestJS API wires in later, so it owns no process-level concerns (no env reading, no logging sink, no scheduling) beyond what the composition root injects.

## 2. Compliance note

TikTok's terms prohibit automated collection. The ROW terms say users may not "use automated scripts to collect information from or otherwise interact with the Services", and the US terms prohibit using "any automated system or software" to "scrape, crawl, export or otherwise extract any data or content". CONFIRMED, https://www.tiktok.com/legal/page/row/terms-of-service/en and https://www.tiktok.com/legal/page/us/terms-of-service/en.

No official API answers the Phase 1 question. The Display API exposes counts and profile fields only; no scope returns a following list or liked list. CONFIRMED, https://developers.tiktok.com/doc/tiktok-api-scopes/. The Research API does expose following and liked-video lists, but eligibility is limited to academic and not-for-profit researchers who show "independence from commercial interests". CONFIRMED, https://developers.tiktok.com/products/research-api/.

Every source in this plan, including the paid vendors, is therefore automated access that TikTok's terms forbid. The plan records this as a business risk the product owner accepts; the code treats it as an operational risk (bot walls, rotation of signing, vendor outages) and measures it.

## 3. Domain and source contract

### 3.1 Value objects

| Type        | Built from                                                                                 | Normalization                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Handle`    | `@name`, `name`, `https://www.tiktok.com/@name`, profile URL with a trailing path or query | Strip scheme, host, `@`, trailing path and query; lowercase; 1 to 24 characters from `a-z0-9_.`. The 24-character limit and character set are PARTIALLY CONFIRMED (third-party pages only, see 12). |
| `AccountId` | Provider payloads only                                                                     | Opaque platform identifier, never constructed from user input. TikTok's is the `secUid`.                                                                                                            |
| `ContentId` | Numeric id, `https://www.tiktok.com/@x/video/<id>`, `tiktok.com/video/<id>`                | Numeric id extracted. `vm.tiktok.com`, `vt.tiktok.com` and `tiktok.com/t/` short links are rejected with reason `short_link_unsupported` until a source resolves them.                              |
| `BioToken`  | Platform-generated string                                                                  | One non-blank token of at most 64 characters. Matched as a whole whitespace-delimited token in the bio, case-sensitive; a token with punctuation attached counts as absent.                         |

Every value object carries its `platform`. `parseHandle`, `parseContentId` and `parseBioToken` validate once with Zod and return a `Result` with an `InvalidInput` on failure; `accountId` is built by adapters from a parsed provider payload. Platform-specific rules live in `src/domain/platforms/<platform>.ts`.

### 3.2 Checks

| Check     | Input                               | Question answered                                       |
| --------- | ----------------------------------- | ------------------------------------------------------- |
| `profile` | subject `Handle`                    | Who is this account: account id, bio, privacy flags.    |
| `follows` | performer `Handle`, target `Handle` | Does the performer's following list contain the target? |
| `liked`   | performer `Handle`, `ContentId`     | Does the performer's liked list contain the content?    |

`owns` is not a source check: it is `profile` followed by a token match inside the library. `watch` is not a source check either: it is `follows` or `liked` repeated on a schedule by the caller.

### 3.3 Closed outcome set

```ts
type Outcome = 'verified' | 'not_following' | 'private' | 'not_found' | 'source_error';
```

| Outcome         | Meaning for `follows`                                     | Meaning for `liked`                                      | Meaning for `owns`              |
| --------------- | --------------------------------------------------------- | -------------------------------------------------------- | ------------------------------- |
| `verified`      | Target present in the performer's following list          | Video present in the performer's liked list              | Token present in the bio        |
| `not_following` | List read to completion or to the page cap, target absent | List read to completion or to the page cap, video absent | Bio read, token absent          |
| `private`       | Following list hidden or account private                  | Liked list hidden or account private                     | Account private, bio unreadable |
| `not_found`     | Performer or target account does not exist                | Performer account or video does not exist                | Account does not exist          |
| `source_error`  | The source could not answer                               | The source could not answer                              | The source could not answer     |

Two rules are not negotiable:

- A source failure of any kind (timeout, network, 5xx, 429, auth, unparseable payload, unknown status code) is `source_error`. It is never `not_following`.
- `not_following` after a page cap is reported with `evidence.pagesRead` and `evidence.listExhausted = false` so the caller can decide whether to re-check with a higher cap.

### 3.4 Contract

The contract as implemented in `packages/verification` (names from `docs/glossary.md`):

```ts
type Check =
  | { kind: 'profile'; subject: Handle }
  | { kind: 'follows'; performer: Handle; target: Handle }
  | { kind: 'liked'; performer: Handle; content: ContentId };

interface CallContext {
  signal: AbortSignal;
  pageCap: number;
}

type Answer<K extends CheckKind> =
  | { outcome: 'verified' | 'not_following'; evidence: EvidenceByKind[K]; cost: Cost }
  | { outcome: 'private' | 'not_found'; cost: Cost }
  | { outcome: 'source_error'; error: SourceError; cost?: Cost };

interface VerificationSource {
  readonly name: SourceName;
  readonly platform: Platform;
  readonly supports: ReadonlySet<CheckKind>;
  answer<K extends CheckKind>(check: CheckOf<K>, context: CallContext): Promise<Answer<K>>;
}

interface Attempt {
  source: SourceName;
  platform: Platform;
  check: CheckKind;
  outcome: Outcome;
  error?: SourceError;
  cost?: Cost;
  startedAt: number;
  latencyMs: number;
}

type Verdict<K extends CheckKind> = (
  | { outcome: 'verified' | 'not_following'; evidence: EvidenceByKind[K]; source: SourceName }
  | { outcome: 'private' | 'not_found'; source: SourceName }
  | { outcome: 'source_error' }
) & { check: CheckOf<K>; attempts: readonly Attempt[] };
```

A source answers one method for every check kind it supports; adapters build it with `defineSource(identity, handlers)` from per-kind handlers. `ProfileEvidence` is `accountId`, `bio`, `isPrivate` and the optional `followingVisible` and `likesVisible`; `ListEvidence` is `pagesRead` and `listExhausted`. Latency and start time are measured by the chain, not reported by the source. `Cost` is `{ unit: 'request' | 'units' | 'usd'; amount }`.

`SourceErrorKind` is a closed union too: `timeout | network | http | auth | rate_limited | blocked | parse | unknown_status | unexpected`. `blocked` is a bot wall or captcha page; `unexpected` is an error a source threw instead of answering.

The package follows ADR 0001 (`docs/adr/0001-verification-context-architecture.md`): `src/domain/` holds the value objects, the outcome model and pure rules; `src/ports/` holds `VerificationSource`, `Clock` and `MeasurementSink`; `src/application/` holds the chain and the use cases; `src/adapters/<provider>/` holds one adapter per provider and `src/adapters/resilience/` the decorators; `src/testing/` holds in-memory fakes. Vocabulary is in `docs/glossary.md`.

## 4. Chain and fallback

The chain is a strategy (which source answers) plus chain of responsibility (who gets asked next).

- Order comes from `VERIFICATION_SOURCE_ORDER`, a comma-separated list of source names. The CLI turns it into the `order` field of the verifier config; the composition root validates the config once (`order` non-empty without duplicates, `timeoutMs` and `pageCap` positive integers) and fails at startup on an unknown or duplicate name.
- For a check, the chain walks the order, skipping sources that serve another platform or whose `supports` lacks the check kind. If no source serves the check, the verdict is `source_error` with zero attempts.
- The first answer whose outcome is not `source_error` is final. The chain stops there.
- If every source answers `source_error`, the verdict is `source_error` with every attempt attached.
- `private` and `not_found` are final answers, not reasons to try another source. A second source cannot see a hidden list either, and trying it only spends money.
- A source that throws instead of answering is recorded as `source_error` with kind `unexpected`, and the chain moves on. A cancellation requested by the caller through `options.signal` is propagated as a rejection, not recorded as an outcome.
- Each source is wrapped by `withTimeout` at the composition root, a decorator built on cockatiel's aggressive timeout policy. It hands the source an `AbortSignal` that the adapter must forward to `fetch`; when the time runs out, the attempt becomes `source_error` with kind `timeout` whatever the source does next. Retry is deferred: retrying a timeout doubles worst-case latency and retrying a rate limit makes it worse, so the measurement log decides whether a retry decorator earns its place. A circuit breaker per source is deferred for the same reason.
- Every attempt carries `startedAt` and `latencyMs` from the `Clock` port and is reported to the `MeasurementSink` port as it happens; the verdict carries all of them so the measurement log sees every call, including the failed ones.

The composition root is one function, `createVerifier(config, deps)`, in `packages/verification/src/create-verifier.ts`. The caller constructs the adapters with their credentials and passes them in `deps.sources`; the root validates `config` once with Zod, wraps every source with the decorators, and returns the use cases. Nothing else in the library reads configuration.

## 5. Scraper source

### 5.1 Profile from the HTML page

`GET https://www.tiktok.com/@{handle}` returns HTML with `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__">`. The JSON holds `__DEFAULT_SCOPE__`. The script id and `__DEFAULT_SCOPE__` are PARTIALLY CONFIRMED from two open-source clients (davidteather/TikTok-Api `TikTokApi/api/video.py`; sangzun-han/Tiktok-Api `src/session/app-context.ts`). The key `webapp.user-detail` and the fields `userInfo.user.signature` and `userInfo.user.privateAccount` are UNCONFIRMED: they appear only in third-party payload samples. `userInfo.user.id`, `secUid`, `uniqueId`, `followingVisibility` and `openFavorite` are PARTIALLY CONFIRMED from the same clients. A direct fetch of a TikTok profile answered with a "Please wait..." interstitial, so none of this was seen against TikTok itself.

No request signing is needed for the HTML page (UNCONFIRMED; it follows from the clients fetching it with a plain GET). TLS fingerprinting may matter: sangzun-han routes requests through a Python `curl_cffi` bridge "which gives requests a Chrome TLS handshake". CONFIRMED that the repo does this, UNCONFIRMED that it is required. The first scraper session measures the success rate of a plain Node `fetch` with a browser user agent before adding anything.

### 5.2 Following list

`GET https://www.tiktok.com/api/user/list/?secUid=…&count=…&minCursor=…&maxCursor=0&scene=21` (scene 67 for followers). Response `userList`, `total`, `minCursor`, `hasMore`. PARTIALLY CONFIRMED, from sangzun-han `src/tiktok/tiktok.service.ts` and README. The request must carry `X-Gnarly`, `X-Dynosaur` and an `msToken`; that client sends `X-Bogus` as the literal `1`. PARTIALLY CONFIRMED (same repo; carcabot/tiktok-signature README still says it generates both X-Bogus and X-Gnarly). First appearance of X-Gnarly: the justscrapeme/tiktok-web-reverse-engineering version table starts at 5.1.0 dated 2025-05-10 and ends at 5.3.2 dated 2026-09-13. PARTIALLY CONFIRMED (third-party table, no TikTok statement).

Hidden following list: HTTP 200 with `statusCode: 10222` and no list. PARTIALLY CONFIRMED (sangzun-han README error table; the README also says the list is readable only when `userInfo.user.followingVisibility` is `1`). `statusCode: 10221` means user not found, not hidden likes. REFUTED for "hidden likes" (sangzun-han README).

Pagination strategy: a performer completes the task, then verification runs, so the target is almost always on the first page of the following list. The scraper reads up to `pageCap` pages (default 3) before answering `not_following` with `listExhausted = false`. The measurement log records how many pages each `verified` needed.

### 5.3 Liked list

`GET https://www.tiktok.com/api/favorite/item_list/?secUid=…&cursor=…&count=30` returns `itemList`, `cursor`, `hasMore`. PARTIALLY CONFIRMED (davidteather `user.py` `liked()`, sangzun-han README). When `userInfo.user.openFavorite` is false, the endpoint answers 200 with `statusCode: 0` and no `itemList`. PARTIALLY CONFIRMED (sangzun-han README). The adapter therefore reads the profile first and returns `private` from `openFavorite` instead of inferring it from an empty list.

### 5.4 Signer port

Signing lives behind a second port so the sidecar can be swapped:

```ts
interface RequestSigner {
  sign(input: {
    url: string;
    userAgent: string;
  }): Promise<{ url: string; headers: Record<string, string> }>;
}
```

The scraper adapter calls the signer over HTTP at `TIKTOK_SIGNER_URL`, under the same timeout policy. A signer failure is `source_error` with kind `network` or `http`.

### 5.5 Sidecar evaluation: sangzun-han/Tiktok-Api

| Aspect        | Finding                                                                                                                                                                                                                   | Mark                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| License       | MIT, "Copyright (c) 2026 sangzun-han"                                                                                                                                                                                     | CONFIRMED           |
| Activity      | Created 2026-10-13, one commit ("Initial commit", 2026-10-14), 1 star, 1 fork, 0 open issues                                                                                                                              | CONFIRMED           |
| How it signs  | Pure TypeScript port of TikTok's `webmssdk` (comments cite version 2.0.0.561, `DEFAULT_SDK_VERSION = '5.3.2'`); computes `X-Gnarly` and `X-Dynosaur`, sends `X-Bogus` as `1`                                              | CONFIRMED           |
| Transport     | Python `curl_cffi` bridge for a Chrome TLS handshake; `node-tls-client` and `undici` in package.json                                                                                                                      | CONFIRMED           |
| Shape         | NestJS 10 REST server on port 3000, Dockerfile and docker-compose, default 2000 ms minimum interval between requests, read-only routes, no logged-in routes                                                               | CONFIRMED           |
| Rotation risk | The signer is a static port of one SDK version. The third-party version table shows at least four SDK versions between 2025-05 and 2026-09. Each bump means a re-port, and this repo has no track record of shipping one. | PARTIALLY CONFIRMED |

Alternatives:

| Project                                     | Language, license | Activity                                  | Signing method                                                                                                             | Mark      |
| ------------------------------------------- | ----------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------- |
| carcabot/tiktok-signature                   | JavaScript, MIT   | 1,049 stars, pushed 2026-10-16, npm 4.3.6 | Headless Chrome (puppeteer) runs TikTok's own SDK; `POST /signature` returns `x-bogus`, `x-gnarly`, signed URL, user agent | CONFIRMED |
| davidteather/TikTok-Api                     | Python, MIT       | 6,724 stars, pushed 2026-08-24            | Playwright browser session                                                                                                 | CONFIRMED |
| justscrapeme/tiktok-web-reverse-engineering | JavaScript, MIT   | 184 stars, pushed 2026-09-13              | Pure JS X-Gnarly encoder with a per-version table                                                                          | CONFIRMED |

Recommendation: adopt carcabot/tiktok-signature as the Docker sidecar behind the `RequestSigner` port. Do not adopt or fork sangzun-han now; keep it as a reference for endpoint parameters and status codes. Do not write a signer.

Tradeoff: a browser-executed signer survives SDK rotation because it runs whatever SDK TikTok serves, at the cost of a Chrome process (hundreds of MB) and tens to hundreds of milliseconds per signature. A pure port signs in about 2 ms but breaks on every rotation and depends on someone re-porting; with one maintainer and one commit, that someone would be us, which is the "write our own" option with extra steps. Whether carcabot's sidecar loads the SDK live or bundles it, and whether it mints the `msToken` the content endpoints need, is UNCONFIRMED and is the first thing the scraper session checks. If the measured scraper success rate stays below the threshold in section 10, the paid sources become the default order and the scraper stays as the last fallback.

### 5.6 Live findings, 2026-11-02

- Plain fetch, impit and got-scraping all get the WAF challenge page for the profile HTML; neither impersonation client is installed. The cookies and user agent of a signer identity pass the challenge, so the scraper fetches the page with the signer's headers and no browser.
- The page WAF refused this network after about 20 page loads in 25 minutes; the signed list endpoints kept answering. Profile reads are the scraper's weak point; pace them and expect `blocked`.
- The sidecar runs from the image built with its Dockerfile: `docker run -d --name tiktok-signature -p 8080:8080 tiktok-signature:local`. It is ready in about 15 seconds and signs in about 20 ms. Its compose file carries no credential.
- Measured latency: profile page 0.7 to 1.7 s, following page about 0.5 s, liked page about 0.8 s.

## 6. Paid API sources

### 6.1 LamaTok

- Base URL `https://api.lamatok.com`, auth header `x-access-key`. CONFIRMED, https://api.lamatok.com/openapi.json.
- Endpoints used: `/v1/user/by/username` (profile), `/v1/user/following/by/username` and `/v2/user/following/by/secUid` (following), `/v2/user/likes/by/secUid` (liked, the only likes endpoint), `/v1/media/by/url` (video id resolution), `/sys/balance`. CONFIRMED, same spec.
- Pricing: pay per successful response (200, 403, 404 are charged; 50x are not), tiers from $0.02 per request at a $20 deposit down to $0.0006 at $300; 100 free requests on signup. CONFIRMED, https://lamatok.com and https://lamatok.com/faq.
- Pagination: v1 list endpoints take `page_id` and return `next_page_id`; v2 endpoints take `cursor`, `max_cursor` or `max_time`. CONFIRMED (request side). Response fields are UNCONFIRMED: every 200 response in the spec has an empty schema.
- Private-account indicator: UNCONFIRMED. Only prose says private accounts are returned "without the video list".
- Rate limits: UNCONFIRMED. Mentioned, no numbers.

Mapping draft, to be confirmed against recorded fixtures: 404 on profile is `not_found`; 403 on a list is `private`; a list page is scanned for the target; 5xx, timeouts and unknown bodies are `source_error`. Cost unit is `request`, converted to USD with the tier price recorded in the measurement table.

#### Fixture recording plan, from the live spec

Read from `https://api.lamatok.com/openapi.json` on 2026-11-02 (OpenAPI 3.1.0, API version 1.4.5). The spec wins over earlier wording in this plan; the differences are listed after the table. Budget: 23 planned requests of the 100 free ones, hard stop at 40. Every call records the status code, the JSON body, the response headers (the spec names an `x-lamatok-info` billing header) and the wall-clock latency.

| #   | Endpoint                                                                                                                                                                                | Input                                    | Purpose                                                                                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/sys/balance`                                                                                                                                                                          | none                                     | Balance before recording; confirms the key                                                                                                                  |
| 2   | `/v1/user/by/username`                                                                                                                                                                  | public performer                         | Profile shape: `secUid`, bio, privacy flags                                                                                                                 |
| 3   | `/v1/user/by/username`                                                                                                                                                                  | private performer                        | Private profile shape                                                                                                                                       |
| 4   | `/v1/user/by/username`                                                                                                                                                                  | username that does not exist             | 404 body for `not_found`                                                                                                                                    |
| 5   | `/v3/user/by/username`                                                                                                                                                                  | private performer                        | Compare with 3; v3 is billed 1 to 3 requests                                                                                                                |
| 6   | `/v3/user/by/username`                                                                                                                                                                  | username that does not exist             | 404 body for `not_found` on v3                                                                                                                              |
| 7   | `/v1/user/following/by/secUid`                                                                                                                                                          | public performer, `count` 30             | Page 1 shape, `next_page_id`                                                                                                                                |
| 8   | `/v1/user/following/by/secUid`                                                                                                                                                          | same, `page_id` from 7                   | Page 2, pagination contract                                                                                                                                 |
| 9   | `/v1/user/following/by/secUid`                                                                                                                                                          | performer with hidden following          | Hidden-list status code and body for `private`                                                                                                              |
| 10  | Profile HTML carries `__UNIVERSAL_DATA_FOR_REHYDRATION__` with `__DEFAULT_SCOPE__`                                                                                                      | CONFIRMED (live 2026-11-02)              | Recorded from the profile page of a public account; fixture `adapters/scraper/fixtures/profile-public.html`                                                 |
| 11  | `webapp.user-detail` holds `userInfo.user` with `id`, `secUid`, `uniqueId`, `signature`, `privateAccount`, `followingVisibility`, `openFavorite`; `statusCode` 10221 for a missing user | CONFIRMED (live 2026-11-02)              | Same recording; `followingVisibility` is 1 when visible, 2 when hidden                                                                                      |
| 12  | `/api/user/list/?scene=21` is the following list, with `userList`, `hasMore`, `minCursor`, `maxCursor`, `total`                                                                         | CONFIRMED (live 2026-11-02)              | Fixture `following-page-exhausted.json`                                                                                                                     |
| 13  | Content endpoints need `X-Gnarly` and `msToken`; carcabot signs both and mints `msToken` as a cookie of its browser identity                                                            | CONFIRMED (live 2026-11-02)              | Signed following and liked calls answered 200 with data                                                                                                     |
| 14  | `/v2/user/likes/by/secUid`                                                                                                                                                              | same, `cursor` from 13                   | Pagination contract                                                                                                                                         |
| 15  | Hidden following list answers `statusCode 10222` with HTTP 200 and no `userList`                                                                                                        | CONFIRMED (live 2026-11-02)              | Fixture `following-hidden.json`                                                                                                                             |
| 16  | `statusCode 10221` means hidden likes                                                                                                                                                   | REFUTED (live 2026-11-02)                | 10221 is user not found; hidden likes answer 200 with `statusCode 0`, no `itemList` and `hasMore` true (fixture `liked-hidden.json`)                        |
| 17  | Liked list is `/api/favorite/item_list/` with `cursor` and `hasMore`                                                                                                                    | CONFIRMED (live 2026-11-02, hidden case) | A minimal query answers 400 `statusCode 10201 missing required fields`; the standard web query (`aid=1988`, `app_name`, `device_platform`, ...) is accepted |
| 18  | `/v1/media/by/url`                                                                                                                                                                      | a profile URL                            | Declared 400 for a non-media link                                                                                                                           |
| 19  | `/v1/media/by/id`                                                                                                                                                                       | 19-digit id from 16                      | Media shape by id                                                                                                                                           |
| 20  | `/v1/media/by/id`                                                                                                                                                                       | an 18-digit id                           | 422 validation body, and whether 422 is charged                                                                                                             |
| 21  | `/v1/user/by/username`                                                                                                                                                                  | a one-character username                 | 422 for input the domain accepts but the vendor rejects                                                                                                     |
| 22  | carcabot sidecar handles `msToken` and loads the SDK live                                                                                                                               | PARTIALLY CONFIRMED                      | `msToken` comes from the identity's cookie jar (confirmed). The SDK is a bundled `webmssdk_5.1.3.js`, not loaded live, so a rotation needs a sidecar update |
| 23  | `/sys/balance`                                                                                                                                                                          | none                                     | Balance after recording; gives the charged total                                                                                                            |

Where the spec and the session brief disagree:

- The brief named `/v1/user/by/username` for profiles. The spec adds `/v3/user/by/username`, which also returns profiles v1 answers with `404 ProfileUnavailable`, and bills 1 request per call or 2 to 3 for a restored profile. Calls 3 to 6 record both; the measurement decides which the adapter uses.
- The brief described v2 pagination as cursors. The spec gives each v2 endpoint its own parameter: `max_time` for following, `cursor` for likes, `max_cursor` for medias. v1 list endpoints use `page_id` and return `next_page_id`.
- The brief mapped 401 and 403 to `auth`. The spec declares no 401 or 403 response on any endpoint, only 200, 404 and 422. Call 22 establishes the real code for a bad key.
- The brief treated short links as unsupported. `/v1/media/by/url` accepts `vm.tiktok.com`, `vt.tiktok.com` and `tiktok.com/t/` links and answers 400 for a profile, hashtag or non-TikTok link. The LamaTok source can therefore resolve short links; see open question 10.
- Input constraints the spec declares and the domain does not: `username` 2 to 24 characters; `secUid` 55 to 76 characters matching `^[a-zA-Z0-9_/-]+$` on v1; media `id` exactly 19 digits; v2 `count` 1 to 50. Call 21 shows what a one-character handle yields.
- Billing for a 422 validation error is not stated. The balance delta across calls 1 to 23 gives the charged total.

### 6.2 EnsembleData

- Official npm package `ensembledata` 0.1.12, MIT, published 2026-01-22, ships TypeScript types, repo EnsembleData/ensembledata-node (2 stars). CONFIRMED, https://registry.npmjs.org/ensembledata.
- Every response carries `unitsCharged` (also on the error class). CONFIRMED, `types/requester.d.ts`.
- Base URL `https://ensembledata.com/apis`, token as a required query parameter. CONFIRMED, https://ensembledata.com/apis/docs.
- Endpoints: `/tt/user/info` (username), `/tt/user/info-from-secuid`, `/tt/user/followings` (with `page_token` and `cursor`), `/tt/user/liked-posts` (`secUid`, `cursor`), `/tt/post/info` (URL). CONFIRMED, `src/client.js` in the package repo.
- Pricing: free trial 50 units per day; paid plans from 1,500 units per day at $100 per month. User info 1 unit, post information 2 units, followers list 2 units per 100. CONFIRMED, https://ensembledata.com/pricing. Units for followings and liked posts: UNCONFIRMED (not in the table read).
- Whether liked posts are returned only when public: UNCONFIRMED.

Decision for the adapter: call the endpoints with the shared HTTP client rather than the `ensembledata` package. The package is a thin typed wrapper with two stars; using it would bypass the shared timeout, abort and measurement path. Revisit if its types save real work once the schemas are recorded.

## 7. CLI

`apps/cli` drives the library and writes the measurement log. Proposed dependency: commander 15.0.0 (node >= 22.12). The decision is taken in the CLI session after checking the Node 26 built-in `util.parseArgs` is not enough for subcommands.

| Command   | Arguments and options                                                | Output                                            |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------- |
| `profile` | `<handle>`                                                           | secUid, bio, privacy flags, source, latency, cost |
| `follows` | `<performer> <target>`                                               | outcome, evidence, attempts                       |
| `liked`   | `<performer> <video>`                                                | outcome, evidence, attempts                       |
| `owns`    | `<handle> <token>`                                                   | outcome, bio excerpt, attempts                    |
| `watch`   | `follows\|liked <performer> <target> --every <duration> --times <n>` | one line per run, appended to the log             |

Global options: `--order <a,b,c>` (overrides `VERIFICATION_SOURCE_ORDER`), `--source <name>` (single source, no fallback), `--pages <n>` (page cap), `--log <file>` (JSONL measurement log, append), `--json` (machine output).

Exit codes: 0 for `verified`, 1 for `not_following`, 2 for `private`, 3 for `not_found`, 4 for `source_error`, 64 for usage errors. Secrets are read from the environment by the CLI only, parsed once with Zod, and never echoed.

## 8. Measurement log

One JSON line per source attempt, written by the CLI:

```json
{
  "at": "2026-11-02T00:00:00.000Z",
  "check": "follows",
  "source": "lamatok",
  "outcome": "verified",
  "latencyMs": 412,
  "cost": { "unit": "request", "amount": 2 },
  "pagesRead": 1,
  "listExhausted": false,
  "httpStatus": 200,
  "providerStatus": 0,
  "errorKind": null
}
```

Handles are not written to the log; a stable hash of the handle is, so runs can be grouped without the log holding account names. Log files use the `.jsonl` extension, which `.gitignore` excludes; the results table in this document is the tracked summary.

Measurement panel (owned test accounts, created before the scraper session): one performer with public following and public likes, one performer with hidden following, one performer with hidden likes, one private performer, one target account, one target video. Each check runs against each source at least 30 times across different hours to get p50 and p95 latency and a success rate per source.

## 9. Test cases

Unit tests, no network:

In place (session 1):

- Value objects: `@name`, `name`, profile URL, mixed case all parse to the same `Handle`; a video URL and a numeric id parse to the same `ContentId`; short links and invalid inputs fail at the boundary with an `InvalidInput` reason.
- Timeout decorator: fake timers, a source that never settles yields `source_error` with kind `timeout` exactly at the configured duration; the signal handed to the source is aborted; a cancellation requested by the caller propagates instead.
- Chain: `source_error` then `verified` yields `verified` with two attempts; `not_following`, `private` and `not_found` each stop the chain; all `source_error` yields `source_error` with every attempt; a source without `liked` support is skipped for `liked`; no eligible source yields `source_error` with no attempts; a thrown error becomes an `unexpected` attempt; latency and start time come from the clock; the page cap reaches the source.
- Chain invariants, property-based over arbitrary answer sequences: the verdict is never `not_following` unless a source answered it; the verdict is the first definitive answer and the attempts are exactly the sources consulted; every error kind in every position yields `source_error`.
- Ownership: token present, absent, present as part of a longer word (absent), `private`, `not_found` and `source_error` passed through.
- Composition root: configured order wins over argument order; unknown, duplicate or empty order and non-positive numbers are rejected at creation; the timeout applies to every source; the system clock is the default.
- Layer rule: a domain file importing from adapters, a non-test file importing from `testing`, or a domain file importing cockatiel fails `pnpm lint`.

Still to write with the adapters and the CLI:

- Each adapter: one test per row of its mapping table, driven by a sanitized fixture file; unknown provider status code yields `source_error` with kind `unknown_status`; unparseable body yields `source_error` with kind `parse`.
- Pagination: target on page 2 with `pageCap` 3 yields `verified` with `pagesRead` 2; target absent with `pageCap` 1 and `hasMore` true yields `not_following` with `listExhausted` false.
- CLI: each command maps outcomes to the documented exit codes; `--source` disables fallback; the log line schema validates.

Live tests, skipped unless the provider's key name is present in the environment: one `profile`, one `follows` and one `liked` per source against the measurement panel.

## 10. Success criteria

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` exit 0 with every adapter and the chain in place.
- Against the measurement panel, no source ever returns `verified` for a relationship that does not exist, and no source ever returns `not_following` for a failure (checked by reading the log for `errorKind` paired with a non-error outcome).
- Hidden following, hidden likes and private accounts are reported as `private` by every source that supports the check, or as `source_error` if the source cannot tell.
- Per-source success rate (share of attempts that end in a non-`source_error` outcome), p50 and p95 latency, and cost per `verified` are in the results table of this document, each from at least 30 attempts.
- The `watch` command detects an unfollow performed on the panel within one interval.
- A new source can be added by following the `verification-source` skill without changing the chain, the CLI or the domain types.

## 11. Facts register

| #   | Fact                                                                                                                                                                                                                       | Mark                                           | Source                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | LamaTok auth is the `x-access-key` header                                                                                                                                                                                  | CONFIRMED                                      | https://api.lamatok.com/openapi.json                                                                                                                                  |
| 2   | LamaTok has `/v1/user/following/by/username` and `/v2/user/likes/by/secUid`                                                                                                                                                | CONFIRMED                                      | https://api.lamatok.com/openapi.json                                                                                                                                  |
| 3   | LamaTok charges per successful response; 100 free requests                                                                                                                                                                 | CONFIRMED                                      | https://lamatok.com, https://lamatok.com/faq                                                                                                                          |
| 4   | LamaTok response schemas (pagination fields, private flag)                                                                                                                                                                 | UNCONFIRMED                                    | Spec declares empty schemas                                                                                                                                           |
| 5   | LamaTok rate limits                                                                                                                                                                                                        | UNCONFIRMED                                    | Mentioned without numbers                                                                                                                                             |
| 6   | `ensembledata` npm package exists, 0.1.12, MIT, typed                                                                                                                                                                      | CONFIRMED                                      | https://registry.npmjs.org/ensembledata                                                                                                                               |
| 7   | EnsembleData returns `unitsCharged`                                                                                                                                                                                        | CONFIRMED                                      | `types/requester.d.ts` in EnsembleData/ensembledata-node                                                                                                              |
| 8   | EnsembleData endpoints for user info, followings, liked posts, post info                                                                                                                                                   | CONFIRMED                                      | `src/client.js` in EnsembleData/ensembledata-node                                                                                                                     |
| 9   | EnsembleData units for followings and liked posts; likes-must-be-public rule                                                                                                                                               | UNCONFIRMED                                    | Not found in the docs read                                                                                                                                            |
| 10  | Profile HTML carries `__UNIVERSAL_DATA_FOR_REHYDRATION__` with `__DEFAULT_SCOPE__`                                                                                                                                         | CONFIRMED (live 2026-11-02)                    | Recorded from the profile page of a public account; fixture `adapters/scraper/fixtures/profile-public.html`                                                           |
| 11  | `webapp.user-detail` holds `userInfo.user` with `id`, `secUid`, `uniqueId`, `signature`, `privateAccount`, `followingVisibility`, `openFavorite`; `statusCode` 10221 for a missing user                                    | CONFIRMED (live 2026-11-02)                    | Same recording; `followingVisibility` is 1 when visible, 2 when hidden                                                                                                |
| 12  | `/api/user/list/?scene=21` is the following list, with `userList`, `hasMore`, `minCursor`, `maxCursor`, `total`                                                                                                            | CONFIRMED (live 2026-11-02)                    | Fixture `following-page-exhausted.json`                                                                                                                               |
| 13  | Content endpoints need `X-Gnarly` and `msToken`; carcabot signs both and mints `msToken` as a cookie of its browser identity                                                                                               | CONFIRMED (live 2026-11-02)                    | Signed following and liked calls answered 200 with data                                                                                                               |
| 14  | X-Gnarly SDK versions 5.1.0 (2025-05) to 5.3.2 (2026-09)                                                                                                                                                                   | PARTIALLY CONFIRMED                            | justscrapeme/tiktok-web-reverse-engineering                                                                                                                           |
| 15  | Hidden following list answers `statusCode 10222` with HTTP 200 and no `userList`                                                                                                                                           | CONFIRMED (live 2026-11-02)                    | Fixture `following-hidden.json`                                                                                                                                       |
| 16  | `statusCode 10221` means hidden likes                                                                                                                                                                                      | REFUTED (live 2026-11-02)                      | 10221 is user not found; hidden likes answer 200 with `statusCode 0`, no `itemList` and `hasMore` true (fixture `liked-hidden.json`)                                  |
| 17  | Liked list is `/api/favorite/item_list/` with `cursor` and `hasMore`                                                                                                                                                       | CONFIRMED (live 2026-11-02, hidden case)       | A minimal query answers 400 `statusCode 10201 missing required fields`; the standard web query (`aid=1988`, `app_name`, `device_platform`, ...) is accepted           |
| 18  | Display API cannot return following or liked lists                                                                                                                                                                         | CONFIRMED                                      | https://developers.tiktok.com/doc/tiktok-api-scopes/                                                                                                                  |
| 19  | Research API exposes the lists but is limited to academic and not-for-profit research                                                                                                                                      | CONFIRMED                                      | https://developers.tiktok.com/products/research-api/                                                                                                                  |
| 20  | sangzun-han/Tiktok-Api: MIT, one commit 2026-10-14, 1 star, pure-TS signer, Docker                                                                                                                                         | CONFIRMED                                      | https://github.com/sangzun-han/Tiktok-Api                                                                                                                             |
| 21  | carcabot/tiktok-signature: MIT, 1,049 stars, pushed 2026-10-16, puppeteer-based                                                                                                                                            | CONFIRMED                                      | https://github.com/carcabot/tiktok-signature                                                                                                                          |
| 22  | carcabot sidecar handles `msToken` and loads the SDK live                                                                                                                                                                  | PARTIALLY CONFIRMED                            | `msToken` comes from the identity's cookie jar (confirmed). The SDK is a bundled `webmssdk_5.1.3.js`, not loaded live, so a rotation needs a sidecar update           |
| 23  | TikTok terms prohibit automated collection                                                                                                                                                                                 | CONFIRMED                                      | ROW and US terms, section 2                                                                                                                                           |
| 24  | tfa3al.com is a live Arabic platform paying for verified TikTok follows and likes                                                                                                                                          | CONFIRMED                                      | https://tfa3al.com                                                                                                                                                    |
| 25  | cockatiel 4.0.0: MIT, ESM, node >= 22, zero dependencies, last commit 2026-10-29                                                                                                                                           | CONFIRMED                                      | npm registry; https://github.com/connor4312/cockatiel                                                                                                                 |
| 26  | Zod 4.6.7 is the `zod` package; `zod/mini` exists                                                                                                                                                                          | CONFIRMED                                      | npm registry; https://zod.dev/v4                                                                                                                                      |
| 27  | commander 15.0.0 requires node >= 22.12                                                                                                                                                                                    | CONFIRMED                                      | npm registry                                                                                                                                                          |
| 28  | LamaTok `/v1/media/by/url` accepts `vm.tiktok.com`, `vt.tiktok.com` and `/t/` links                                                                                                                                        | CONFIRMED                                      | https://api.lamatok.com/openapi.json, API version 1.4.5                                                                                                               |
| 29  | LamaTok `/v3/user/by/username` returns profiles v1 answers with 404; billed 1 to 3 requests                                                                                                                                | CONFIRMED (declared)                           | https://api.lamatok.com/openapi.json; billing via the `x-lamatok-info` header                                                                                         |
| 30  | LamaTok declares no 401 or 403 response on any endpoint                                                                                                                                                                    | CONFIRMED                                      | https://api.lamatok.com/openapi.json; the real code is recorded by fixture call 22                                                                                    |
| 31  | LamaTok `username` is 2 to 24 characters, media `id` exactly 19 digits                                                                                                                                                     | CONFIRMED                                      | https://api.lamatok.com/openapi.json parameter schemas                                                                                                                |
| 32  | Plain Node fetch, impit 0.14.8 and got-scraping 4.2.2 all receive TikTok's WAF challenge page for the profile HTML from this network                                                                                       | CONFIRMED (live 2026-11-02)                    | 1462-byte `Please wait...` page, `x-tt-system-error: 3`; TLS impersonation is not the fix                                                                             |
| 33  | The signer identity's cookies and user agent let plain fetch pass the WAF for the profile page                                                                                                                             | CONFIRMED, then refused                        | Passed for about 20 page loads in 25 minutes, then every page load, including the sidecar's own browser fetch, got the challenge again. Signed API calls kept working |
| 34  | `/api/user/detail/` answers 200 with an empty body through this signer                                                                                                                                                     | CONFIRMED (live 2026-11-02), cause UNCONFIRMED | Not used; the profile page stays the profile source                                                                                                                   |
| 35  | Profile page carries `userInfo.stats` and `userInfo.statsV2` with `followerCount`, `followingCount`, `videoCount`, `heartCount`; `statsV2` holds exact values as strings, `stats` rounded numbers                          | CONFIRMED (recorded 2026-11-02)                | Four public profiles                                                                                                                                                  |
| 36  | `userInfo.user.createTime` is the account creation time in Unix seconds; `avatarThumb`, `avatarMedium`, `avatarLarger` are CDN URLs                                                                                        | CONFIRMED (recorded 2026-11-02)                | Four public profiles; creation dates 2015 to 2018 are plausible for those accounts                                                                                    |
| 37  | The profile page carries no post list and no latest-post time: `userInfo.itemList` is empty and `seo.abtest.vidList` holds experiment ids, not video ids. `/api/post/item_list/` answers an empty body through this signer | CONFIRMED (live 2026-11-02)                    | The activity rule has no confirmed signal; closest candidates are a working signature for `/api/post/item_list/` or a paid source's media list                        |
| 38  | How a default avatar can be recognized in the avatar URL                                                                                                                                                                   | UNCONFIRMED                                    | No account with a default avatar was in the panel; the avatar rule accepts configured URL markers and reports inconclusive without them                               |
| 39  | The following list is newest-first: page cursors are Unix timestamps that decrease page by page (1659875581 then 1617300091 for an 82-account list); entries carry no follow time                                          | CONFIRMED (live 2026-11-02)                    | Page 1 is where a fresh follow appears                                                                                                                                |

## 12. Open questions

1. Outcome naming: `not_following` is also used for an absent like and an absent bio token. Keep the five names as given, or rename to `absent` before the API phase freezes the vocabulary.
2. Handle character rules: the code enforces `a-z0-9_.` and at most 24 characters, the rule every third-party page repeats, but TikTok's own help page answered fetches with a bot wall, so it stays PARTIALLY CONFIRMED. The minimum length is left at 1 so that no real account is rejected.
3. Short links (`vm.tiktok.com`, `vt.tiktok.com`, `tiktok.com/t/`) are rejected at parse time. Resolving them needs a network call, so it belongs to a source; decide in the CLI session whether the CLI resolves them before building the check.
4. The chain skips sources that serve another platform, but with one platform in the union that branch cannot be exercised by a test; the first second-platform session adds that test.
5. Whether a plain Node `fetch` with a browser user agent gets the profile HTML, or whether a Chrome TLS fingerprint is required.
6. Whether the carcabot sidecar mints `msToken` and loads TikTok's SDK live.
7. LamaTok response shapes for lists and private accounts; whether LamaTok charges a 403 on a hidden list as a successful response (its pricing says 403 is charged).
8. EnsembleData unit costs for followings and liked posts, and its behavior on hidden lists.
9. Page cap default: 3 pages of the following list is a guess until the measurement log shows the page distribution of `verified`.
10. Re-check schedule for `watch` (24 h, 72 h, 7 d is the working assumption) and the payout hold that depends on it: a product decision.
11. Whether the measurement panel accounts can be created and kept without TikTok suspending them.

## 13. Next sessions

Done: **Domain and contract** (value objects, outcome model, ports, timeout decorator, chain, ownership use case, composition root, ADR 0001, glossary).

Done: **Shared HTTP client**, **Scraper** (profile, following, liked, signer sidecar), **Account linking** (ADR 0002, `packages/social-accounts`, `link start` and `link verify` in the CLI).

1. **LamaTok adapter**: add the shared HTTP client (Node `fetch` with the context signal, auth header injection, Zod parsing of the body) under `src/adapters/http/`, record fixtures with the 100 free requests against the measurement panel, write the schemas, mapping and tests, fill the first row of the results table. First action: confirm the key name exists with `grep -oE "^LAMATOK_ACCESS_KEY=" .env` and call `/sys/balance` through the shared client.
2. **EnsembleData adapter**: same procedure with the 50 daily trial units; settle open question 6. First action: record a `/tt/user/info` fixture and read `unitsCharged`.
3. **CLI**: implement the five commands, exit codes and the measurement log against the two paid adapters; the CLI parses the environment once, builds the sources with their keys, and calls `createVerifier`. First action: decide commander versus `util.parseArgs` by writing the `follows` command both ways in a scratch file and keeping the shorter one.
4. **Scraper, profile only**: measure plain-fetch success on the profile HTML, write the HTML adapter for `profile` and `owns`, settle open question 3 and facts 10 and 11. First action: fetch one panel profile with Node `fetch` and record whether the rehydration script is present.
5. **Scraper, lists and signer**: run carcabot/tiktok-signature in Docker, implement the signer port and the following and liked list reads, settle open questions 4 and 7, complete the results table. First action: `docker compose up` the sidecar and sign one `/api/user/list/` URL.
6. **Watch and results**: implement `watch`, run the 30-attempt panel against every source, write the results table and the recommended default order. First action: run `watch follows` against the panel while unfollowing from the performer account.

## 14. Results

Measured on 2026-11-02 through the chain with the scraper as the only source, against well-known public accounts (recorded in the untracked notes). Paid sources have no keys yet.

| Case                                | Source                | Outcome       | Latency                           | Cost       | Note                                          |
| ----------------------------------- | --------------------- | ------------- | --------------------------------- | ---------- | --------------------------------------------- |
| profile, public account             | scraper               | verified      | 0.7 to 1.7 s                      | 1 request  | Evidence: secUid, bio, privacy flags          |
| profile, missing handle             | scraper               | not_found     | 0.7 s                             | 1 request  | `statusCode 10221`                            |
| follows, known pair                 | scraper               | verified      | 0.5 s list page after the profile | 2 requests | Target on page 1, `listExhausted` false       |
| follows, large account not followed | scraper               | not_following | 0.5 s list page after the profile | 2 requests | Single page, `listExhausted` true             |
| follows, hidden following list      | scraper               | private       | profile only                      | 1 request  | `followingVisibility` 2; list call skipped    |
| liked, hidden likes                 | scraper               | private       | profile only                      | 1 request  | `openFavorite` false; list call skipped       |
| liked, public likes                 | scraper               | pending       |                                   |            | No public-likes account found among the panel |
| watch after a fresh follow          | scraper               | pending       |                                   |            | Needs an account the operator controls        |
| unfollow re-check                   | scraper               | pending       |                                   |            | Needs an account the operator controls        |
| every case                          | lamatok, ensembledata | pending       |                                   |            | No key configured                             |
