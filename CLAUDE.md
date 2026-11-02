# Engagement Exchange

TypeScript monorepo: pnpm workspaces, Turborepo, Node 26, ESM only.

- `packages/verification`: the verification library (domain, source contract, chain, adapters).
- `apps/cli`: the command-line driver for Phase 1.
- `docs/plan/`: phase plans. Phase 1 is `docs/plan/phase-1-tiktok-verification.md`.

Commands run from the root: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format`.

## Code

- No comments in code. Names and structure carry the meaning.
- Formatting is Prettier's job, never done by hand.
- Validate input once, with Zod, at the boundary where it enters. No defensive checks for what the types, the caller or an earlier boundary already guarantee. No logic the task does not require.
- Search the repo before creating anything. Extend an existing abstraction before adding a parallel one.
- Before hand-writing a capability, look for a mature, maintained package. Install it when it is clearly better, and justify every dependency in the commit that adds it.
- Patterns only where they solve a problem here: ports and adapters for verification sources, strategy plus chain of responsibility for the fallback chain, value objects for handles and IDs, one composition root for wiring. Prefer the simplest structure that keeps sources swappable.
- A source failure is `source_error`, never `not_following`. The chain falls back only on `source_error`.
- Every outbound call has a timeout.

## Secrets

- Never print a credential.
- Never read a `.env` or docker-compose file with `cat`, `head`, `tail`, `less`, `sed` or a line-range read. To confirm a key exists, grep for its name only: `grep -oE "^LAMATOK_ACCESS_KEY=" .env`.

## Files and git

- Never `sed -i`. Edit with the edit tool, or a byte-level read-modify-write in Python verified by checksum and line-count diff.
- Tracked files and commit messages describe the system only: nothing about the authoring machine, location, timezone or any person. Commit messages stay neutral and never narrate a removal or correction.
- Untracked working notes go in the gitignored notes directory listed in `.gitignore`. Write a record there only when it holds decisions or measurements a later session needs, one record per thread, updated in place. Do not mention that directory in any tracked file except `.gitignore`.

## Skills

- `/engineering-standards`: the review pass to run before every commit.
- `research-and-verification`: how external facts get verified and marked.
- `verification-source`: how to add a source behind the contract.
