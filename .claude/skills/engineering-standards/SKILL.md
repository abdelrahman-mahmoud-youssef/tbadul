---
name: engineering-standards
description: Review pass that checks a change against the repo's engineering rules before it is committed. Use after writing or changing code, before every commit, and when asked to review a diff.
---

# Engineering standards review

The rules live in `CLAUDE.md`. This skill is the procedure that checks a change against them. Run it on the working tree before committing; fix what it finds, then run it again.

## 1. Mechanical checks

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

All four exit 0 before anything else is reviewed.

## 2. Comments

List added comment lines:

```sh
git diff --cached -U0 -- '*.ts' '*.mjs' '*.js' | grep -E '^\+\s*(//|/\*|\*)' || echo "no comments"
```

Every hit is removed. If the line explains something the names cannot carry, rename or restructure until it does.

## 3. Boundaries and logic

For each changed file answer, in one line each, in the reply and not in the file:

- Where does external input enter, and is it parsed with Zod exactly once there?
- Is there a check for a condition the types, the caller or an earlier boundary already guarantee? Remove it.
- Is there logic the task did not ask for? Remove it.
- In `packages/verification`: can any code path turn a failure into `not_following`? That is a defect. Failures are `source_error`, and only `source_error` triggers fallback.
- Does every outbound call carry a timeout?

## 4. Reuse and dependencies

```sh
git diff --cached --name-status | grep '^A'
```

For each added file: name the existing module that was extended instead, or why none fits. For each added dependency: name the package, the version pinned in `pnpm-workspace.yaml`, the capability it replaces, and its last publish date. A dependency without that justification is removed.

## 5. Tracked content

```sh
git diff --cached | grep -inE '[a-z]:\\\\users\\\\|/users/|/home/|timezone|utc[+-]' || echo "clean"
```

Tracked files describe the system only. Anything about the authoring machine, location, timezone or a person is removed. The notes directory is referenced nowhere except `.gitignore`.

## 6. Commit message

Neutral, present tense, describes what the system now does. Never narrates a removal, a correction or a mistake. No attribution trailers.
