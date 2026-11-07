# ClubReady 254

React + TypeScript + Vite starter for an offline-capable club readiness app.
The existing repository is the project root; the npm package is `clubready-254`.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
npm ci
cp .env.example .env
npm run dev
```

Supabase credentials are optional for browsing the starter. Use a public project URL
and anon key only; never place a service-role key in a `VITE_` variable.

```sh
npm run lint
npm run typecheck
npm run build
npm run preview
```

## Structure

- `src/components/`: shared page and PWA UI.
- `src/pages/`: ClubProfile, PlayProof, Opportunities, EvidencePackage route starters.
- `src/db/offline.ts`: versioned Dexie stores and atomic activity/outbox writes.
- `src/services/`: optional Supabase client and explicit activity sync helper.
- `src/types/`: shared domain types.
- `supabase/migrations/`, `supabase/tests/`: reserved for schema and database tests.
- `supabase/functions/`: Edge Function stubs returning HTTP 501.
- `supabase/seeds/opportunities.sql`: placeholder for verified opportunity seed data.
- `docs/`: architecture, proposed API contract, source policy and verification results.

The four pages are development placeholders. Authentication, club forms, server schema,
readiness scoring, opportunity data and evidence exports are not implemented.

## Offline and deployment

Build and serve with `npm run preview` to test the generated service worker. Open the
app once online, wait for the offline-ready notice, then test each route offline.
PWA installation requires HTTPS (or localhost). Deploy `dist/` with an SPA rewrite to
`index.html` so direct route visits work. Service-worker updates ask before reloading.
Only the app shell is precached; Supabase responses are not cached by the worker.
IndexedDB data stays on the current browser/device. Clear it when implementing logout
or account switching before production use.

Sync is opt-in through `syncActivities()` and requires configuration and an authenticated
session. Entries remain queued until the server acknowledges the activity ID.
Do not deploy the function stubs as production implementations.

Configuration follows the official [Tailwind Vite guide](https://tailwindcss.com/docs/installation/using-vite)
and [Vite PWA guide](https://vite-pwa-org.netlify.app/guide/).
