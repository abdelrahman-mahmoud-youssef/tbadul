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

### Not in this context

Scheduling, notifications, the user identity itself (a `UserId` is an opaque string here), and any persistence beyond the in-memory and file adapters needed by tests and the CLI.

## Consequences

- A scheduler calls `verifyAccountClaim(claimId)` with no domain change.
- Thresholds, schedule, TTL and limits are config; changing a number changes no code.
- Two rules can report `inconclusive` until the data gap is closed; the report says so.
- The Verification context's `ProfileEvidence` grows optional fields (`followerCount`, `videoCount`, `avatarUrl`, `createdAt`, `latestPostAt`) so that the scraper can carry what the page offers. Sources that lack a field leave it undefined.
