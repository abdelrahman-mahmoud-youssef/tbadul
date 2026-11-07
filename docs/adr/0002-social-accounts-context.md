# ADR 0002: The Social Accounts context and account linking

Status: accepted.

## Context

A user links a social account by handle or URL. The platform must know the account exists and is public, that it meets eligibility rules, and that the user controls it. Ownership is proven by having the account follow a verification account the platform assigns. Verification is triggered by the user now and by a scheduler later. This is the second bounded context; ADR 0001 defines the first, Verification.

## Decision

### A separate package, depending on Verification through its public surface

`packages/social-accounts` holds the Social Accounts context with the same layers as ADR 0001: `domain`, `ports`, `application`, `adapters`, `testing`, and a composition root. It imports `@engagement-exchange/verification` only for the `Verifier` use cases, the value objects (`Handle`, `AccountId`, `Platform`) and the verdict types. It never imports a verification adapter. The boundary lint policy allows that one external import from every layer; the `domain` layer may import only types from it (the shared value objects `Handle`, `AccountId`, `Platform`), never a value. The Social Accounts domain speaks about profiles through its own `ProfileFacts` type, mapped from `ProfileEvidence` in the application layer.

### Aggregate: AccountClaim

One aggregate, `AccountClaim`, owns the lifecycle of one linking attempt: user, platform, claimed handle, the account id once known, the assigned verification account, the eligibility report, the state, the verify attempts with timestamps, the next allowed verify time and the expiry. States: `eligibility_failed`, `awaiting_follow`, `verified`, `expired`, `rejected`. Transitions are pure functions over the claim; invalid transitions are domain errors, not exceptions. The aggregate is a plain object, as in ADR 0001, persisted through `AccountClaimRepository`.

Departure from the brief: the baseline is not stored as a result on the claim. The baseline's only purpose is to pick a verification account the claimed account does not already follow; once the account is assigned, the fact that it was not followed at start is what `awaiting_follow` means. Storing a baseline result next to it would be a second copy of the same fact.

### Eligibility as independent rules

`EligibilityPolicy` evaluates a list of `EligibilityRule`s, each a pure function of `ProfileFacts`, the current time and the validated config, returning `pass`, `fail` with a reason code, or `inconclusive` with a reason code. `inconclusive` is a departure from the pass-or-fail brief, forced by the data: TikTok's profile page carries no latest-post time and no reliable default-avatar marker (facts 37 and 38), so the activity and avatar rules cannot always decide. The policy config says whether an inconclusive rule blocks (`inconclusiveBlocks`, default false). The report lists every rule's result so the UI can render reasons, and so the gap is visible rather than hidden behind a fake pass.

### Ownership proof and cooldown

At claim start the application picks the first verification account from the pool's candidate order that the claimed account does not already follow, through the Verification context's `follows` check. The pool adapter owns the candidate order; the config-driven adapter shuffles, which keeps randomness out of the domain and the tests deterministic. If every candidate is already followed, the claim is `rejected` with reason `pool_exhausted`.

`VerifyAccountClaim` is the only path to `verified`, for the button and for the scheduler alike. It refuses early calls from the claim's `nextVerifyAt` without touching a source, and it moves the claim to `verified` only on a `verified` verdict. A `not_following`, `private` or `not_found` verdict is a failed attempt: it is recorded and the cooldown advances along the configured schedule. A `source_error` verdict records nothing. Expiry is checked before anything else; an expired claim moves to `expired`.

### Limits enforced through the repository port

ADR 0004 supersedes the original rule here. Ownership is exclusive at verify, not at start: several users may hold open claims on one account, and the repository's verify operation saves the claim and creates the link in one step, refusing with `account_already_claimed` when another user's active link exists. The platform limit counts active links plus `awaiting_follow` claims that have not expired, and claim creation enforces it atomically, in PostgreSQL under an advisory lock taken per user and platform. The count the use case makes before the paid baseline calls is cost avoidance, not the check.

### Ports

`AccountClaimRepository`, `VerificationAccountPool`, `IdGenerator`, and the `Clock` type from the Verification surface. The `Verifier` is a dependency of the composition root, not a port of this context: it is the other context's public use case, typed by that package.

### Claim operations are scoped to their user

Added on 2026-11-07. Every operation on an existing claim takes the user with the claim id: `verifyAccountClaim` and `getAccountClaim` take `{ userId, claimId }`. A claim that belongs to another user answers `claim_not_found`, the same answer as an unknown id, so a caller cannot learn that the claim exists. The check runs before anything else, so a foreign claim is never expired, saved or checked against a source.

### Cancelling a claim

Added on 2026-11-07. A user may cancel their own `awaiting_follow` claim, expired or not, through `cancelAccountClaim({ userId, claimId })`; it moves to a sixth state, `cancelled`, saved by compare-and-set. A claim in any other state answers `claim_not_cancellable` with its state. A cancelled claim holds nothing: it stops counting toward the platform limit and leaves the partial unique index on open claims, so the user may claim the same account again at once. A `verified` claim is a linked account, not a pending attempt, and is never cancelled; removing a linked account is unlinking, which is out of scope here and will revoke the link rather than change the claim.

### Listing a user's accounts

Added on 2026-11-07. `listLinkedAccounts({ userId })` answers one entry per platform in the Verification context's `platforms` list: the limit, the slots used, the active linked accounts (handle as claimed, account id, link time, claim id) and the `awaiting_follow` claims that have not expired, so a client can resume a link flow. The slots used come from the repository's `countHeld`, the count claim creation checks against the limit, so the number shown is the number enforced. The link time is the use case's clock at verify, passed to the repository's verify operation, as claim times already are.

### Not in this context

Scheduling, notifications, the user identity itself (a `UserId` is an opaque string here), and any persistence beyond the in-memory and file adapters needed by tests and the CLI.

## Consequences

- A scheduler calls `verifyAccountClaim({ userId, claimId })` with the claim's own user, with no domain change.
- Thresholds, schedule, TTL and limits are config; changing a number changes no code.
- Two rules can report `inconclusive` until the data gap is closed; the report says so.
- The Verification context's `ProfileEvidence` grows optional fields (`followerCount`, `videoCount`, `avatarUrl`, `createdAt`, `latestPostAt`) so that the scraper can carry what the page offers. Sources that lack a field leave it undefined. Added on 2026-11-06: a profile check may ask for `latestPost`; link start asks for it, and EnsembleData answers it with one extra posts read (1 unit), so the activity rule is enforced at link start and never costs anything on verify. Changed on 2026-11-06: the account-age and default-avatar rules leave the enforced set. No profile source in the default order carries a real creation time (EnsembleData answers 0, ScrapTik's user object has none) and no provider exposes a default-avatar flag, so both would only ever be inconclusive. The eligibility report records the account's creation time, when a source gives it, and its avatar URL as `signals`, kept with the claim for later fraud scoring and never judged.
