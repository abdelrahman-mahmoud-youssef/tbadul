# ADR 0006: Web app

Status: accepted.

## Context

ADR 0005 gives the system an HTTP API with sessions, roles and stable error codes. Performers and admins need a web app on top of it, Arabic first and used mostly on phones. The app must stay within a performance budget and pass accessibility checks from its first screens, and it must not reach around the API into the contexts.

## Decisions

### Stack

Versions verified on 2026-11-07 against the registry and the libraries' documentation:

- Next.js 16.4.5 on the App Router with Turbopack, React 19.3.1, TypeScript 6 with the repo's strictness flags, bundler resolution and the `@/` alias.
- next-intl 4.14.9 for routing and messages, Tailwind CSS 4.3 with tokens in `@theme`, shadcn 4.23 on Radix (`radix-ui` 1.8.1) initialised with `--rtl`, and shadcn's `cn` 0.5.2 for class merging.
- TanStack Query 5.106, React Hook Form 7.91 with `@hookform/resolvers` 7.0.3 on the contract schemas, the Better Auth 1.7.15 React client, Motion 14.10 and Lucide 1.70.
- Libraries a screen needs only after an interaction load on demand: Motion's `animate` on the first theme switch, and the Better Auth client on sign-out. `QueryProvider` is mounted by the first feature that queries, not by the layouts, so screens without queries do not pay for it.
- `apps/web` imports `@engagement-exchange/contracts` and no other workspace package. Lint enforces it, along with `features/*` never importing each other and `components/ui` and `components/brand` importing no feature.

### Routing and locale

- `proxy.ts` (Next.js 16's name for middleware) runs next-intl's routing. Arabic is the default locale and lives at the root with no prefix (`localePrefix: 'as-needed'`). Locale detection and the locale cookie are off while Arabic is the only locale. Adding a locale means adding it to `i18n/routing.ts` with its direction, plus a messages file.
- `app/[locale]` holds the route groups `(marketing)`, `(auth)`, `(app)` and `(admin)`. The locale comes from `next/root-params`, so public pages render statically.
- Links and redirects are localised on the server (`i18n/paths.ts`, `i18n/locale-link.tsx`) and rendered with `next/link`. Server components resolve strings and pass them to client components as props. The client bundle then carries no message formatter. Error boundaries get their copy, one string per error code, from a context the signed-in layouts fill on the server.
- Next.js 16.4 renders a `notFound()` raised below the `[locale]` root layout on the client: the 404 response carries the right status, but its HTML body is empty until hydration. The design tokens therefore also follow `prefers-color-scheme` when the inline theme script has not run.
- Every user-visible string comes from `messages/<locale>.json`, typed through next-intl's `AppConfig`. A key used in code but missing from the file fails the type check and the build. `pnpm lint` also runs `i18n-check`, which fails on undefined or unused keys. Dynamic keys (`errors.*`, `landing.steps.*`) are exempt from the unused check. A test holds `errors.*` equal to the contract's error codes.

### API access and sessions

- `next.config.ts` rewrites `/api/:path*` to `API_ORIGIN` (default `http://127.0.0.1:4000`), so the browser only talks to the web origin and Better Auth's cookies under `/api/auth/*` stay first-party. Rewrites are resolved at build time, so a build serves the `API_ORIGIN` it was built with. Turbo includes `API_ORIGIN` in the build hash. The web app reads `API_ORIGIN` from its own process environment, not from the root `.env`, which holds provider credentials.
- `lib/api-client.ts` is the one way to call the API. It sends JSON with a 10-second timeout and parses every success body with the contract schema. It turns the error envelope into an `ApiRequestError` that carries the code, the details and the status.
- The `(app)` and `(admin)` layouts resolve the session on the server by forwarding the request cookie to `/api/me` at `API_ORIGIN`. Without a session they redirect to sign-in. `(admin)` answers 404 to a signed-in user without the `admin` role.

### Design tokens

- `app/globals.css` and `components/brand` are the design authority. The palette is one primary colour, a deep teal, on a warm sand base. Light and dark themes come from the same semantic tokens: background, foreground, card, primary, secondary, muted, accent, destructive, border, input and ring. Every pair used for text passes WCAG AA. Components use the semantic tokens only, never raw colours.
- IBM Plex Sans Arabic loads through `next/font` in three weights (400, 500 and 700) as the single `--font-sans` token. Body text is 17 px at a line height of 1.7, with no negative letter spacing. Numbers and dates are formatted through `Intl` with the `latn` numbering system (`lib/format.ts`).
- The layout is built at 360 px first, with breakpoints at 768, 1024 and 1280 px. Cards use container queries. Touch targets are at least 44 px (the `touch` spacing token), and the layout respects safe-area insets. Lint refuses physical left and right classes, so only logical properties are used. The theme follows the system preference until the toggle stores a choice, applied before first paint by an inline script. Motion animates only state changes and honours `prefers-reduced-motion`.

### Quality gates

- `pnpm test` includes the web's Vitest suite: components with Testing Library on jsdom, the API client, the formatters, the error-code messages and the logical-properties lint rule.
- `pnpm test:e2e` runs Playwright on Chromium in Arabic. Its global setup builds the web app and the API, then starts `apps/api`'s e2e server: the API over the scripted fake sources and manual clock, on a migrated Testcontainers PostgreSQL, with a test-only control server on a second port. It then starts `next start`. Every screen is captured at 360, 768 and 1280 px in light and dark under `apps/web/e2e/screenshots/`. axe must report zero violations on every capture.
- `pnpm --filter @engagement-exchange/web test:budget` loads each screen in Chromium, gzips every script response until the network is idle, and fails above 150 KB per route.
- `pnpm --filter @engagement-exchange/web test:lighthouse` runs Lighthouse CI five times per screen against the production build, on Lighthouse's default mobile profile (simulated throttling, 4x CPU slowdown) and signed in where the screen needs it. It asserts median LCP ≤ 2.5 s, CLS ≤ 0.1 and TBT ≤ 200 ms. TBT is the lab proxy for INP. Lighthouse refuses to audit a 404 response, so the not-found screen is covered by the budget and axe only.
- The e2e, budget and Lighthouse gates need browsers, Docker and running servers, so they sit outside `pnpm test` and run locally.

## Consequences

- The web app cannot drift from the API's shapes or error codes. A contract change fails its type check, its message test or its lint.
- One process environment sets one API origin per build. The e2e build and a development build overwrite each other's `.next`.
- Next.js 16.4 and React 19.3 alone load about 129 KB of gzipped JavaScript on a route, leaving about 21 KB for the app. Features that add TanStack Query, Zod parsing in the browser, forms and the auth client must load them where they are used, or the budget fails.
- New pages inherit the budget and accessibility gates as soon as they are listed in `e2e/screens.ts`.
- On Lighthouse's mobile profile, hydrating Next.js 16 and React 19 alone costs a blocking time close to 200 ms, and run-to-run spread on one machine exceeds 100 ms. The TBT assertion sits at that floor and can fail without an app change. The medians are the signal to watch, not a single run.
