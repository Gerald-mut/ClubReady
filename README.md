# ClubReady 254

ClubReady 254 is a mobile-first progressive web app for grassroots football clubs in Kenya. It gives club administrators and members one place to maintain a club profile, document activities, and see what evidence they have for tournaments, funding calls, and other opportunities. Clubs can record activities on the pitch with intermittent connectivity and sync them when back online.

## Features

| Feature | What you can do |
| --- | --- |
| Accounts and club membership | Sign up with email and password, recover your account, and create or join a club. Club administrators can issue or revoke invitations and manage member roles. |
| Club profile and documents | Maintain club information and collect supporting files. Administrators manage uploads and members can view or download them through short-lived signed links. Files are marked as supplied by the club. |
| PlayProof | Log training sessions, matches, tournaments, and community activities with a date, location, participant count, and optional photos. Record offline after signing in and loading your club online. |
| Opportunities | Browse the sourced catalogue, review published criteria and deadlines, and keep track of applications within the club. Follow the organiser’s link for application instructions. |
| Readiness | Review persisted, requirement-level assessments and the evidence supporting each result. Club administrators can request reassessment. Some opportunities also offer a comparison against published eligibility criteria using optional self-reported answers. Organisers make eligibility and award decisions. |
| Installable PWA | Install the app from a supported browser and reopen the cached app shell offline after an initial online visit. |

The **Evidence package** page is a placeholder for future export functionality.

## Technology stack

| Layer | Tools |
| --- | --- |
| Frontend | React 19, TypeScript, React Router 7, Tailwind CSS 4, Vite 7 |
| Offline storage and PWA | Dexie 4 over IndexedDB, Vite PWA plugin, Workbox service worker |
| Backend | Supabase Auth, PostgreSQL 17 for local development, PostgREST, SQL RPCs, and Supabase Storage |
| Readiness processing | PostgreSQL job queue and worker functions, Python 3 and `psql` runner, systemd service and timer for Linux |
| Development and testing | Node.js, npm, ESLint, Vitest, Testing Library, jsdom, Playwright, pgTAP, Docker, Supabase CLI, GitHub Actions |

## How it works

1. **Sign in and load a club.** Supabase Auth provides the session. PostgreSQL row-level security and Storage policies enforce club membership and administrator permissions. Supporting documents and activity media use private buckets.
2. **Record activity on the device.** PlayProof saves the activity and its photos atomically in IndexedDB. The queue is scoped to the account and club. With a valid session and connectivity, the client syncs through the Supabase database and Storage APIs. Stable activity IDs support safe retries, and the app keeps a local copy. Clearing browser site data can remove records that have yet to sync.
3. **Compare evidence against opportunity requirements.** Club changes and catalogue updates feed a database-backed readiness queue. A trusted worker evaluates the applicable rules and persists results and supporting references. The app reads those snapshots and displays their processing state. Signup, document uploads, and live catalogue and assessment operations require connectivity.

The service worker precaches the app shell and static assets. IndexedDB provides offline access to PlayProof records. See the [API contract](docs/api-contract.md), [readiness schema](docs/readiness-schema.md), and [worker internals](docs/readiness-worker.md).

## Run locally

### Prerequisites

- Node.js **22.22.2 or later in the 22.x line** and npm, matching the Node 22 CI configuration and the locked development dependencies.
- Docker running locally and Supabase CLI **3.0.0** for the local backend.
- Python 3 and the PostgreSQL client (`psql`) for readiness operations and backend tests.

### 1. Install dependencies and start Supabase

```sh
git clone https://github.com/Gerald-mut/ClubReady.git
cd ClubReady
npm ci
supabase start
supabase status
cp .env.example .env.local
```

The repository includes the local Supabase configuration, migrations, and curated opportunity seed. On a fresh stack, startup initializes the schema and seed. To rebuild a disposable local database from scratch, use `supabase db reset --yes`. This deletes the existing local application data.

### 2. Configure the frontend

Edit `.env.local` using the local API URL and public key shown by `supabase status`. If the CLI labels the public key `anon`, use that value in `VITE_SUPABASE_PUBLISHABLE_KEY`.

```dotenv
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_PUBLISHABLE_KEY=your-local-publishable-key
```

Vite embeds these values in the browser build. Keep database passwords and Supabase secret or service-role keys out of all `VITE_*` variables.

### 3. Open the app

```sh
npm run dev
```

Open http://localhost:5173. Create an account and a club, record a PlayProof activity, and open **Opportunities** to browse the seed catalogue. Supabase Studio runs at http://127.0.0.1:54323, and the local email inbox for recovery links runs at http://127.0.0.1:54324.

### 4. Process readiness jobs locally

The development server and Supabase startup leave queue processing to the worker. On the local stack, run a worker call after creating a club or requesting reassessment, then refresh the opportunity. Each call processes at most one job. Repeat the call if other clubs are ahead in the queue.

```sh
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  -v ON_ERROR_STOP=1 -c 'SET ROLE readiness_worker; SELECT public.process_next_job();'
```

For continuous processing, use the [readiness scheduler guide](docs/readiness-scheduling.md).

### Try the offline experience

Run `npm run build` and `npm run preview`. Open the preview address, sign in, load PlayProof online, and wait for the offline-ready notice. Disconnect, save an activity, and reopen PlayProof. Reconnect and check that the activity syncs. For email-link testing on a preview origin, add that origin to the Supabase Auth redirect allowlist.

## Test and build

```sh
npm run lint         # ESLint
npm run typecheck    # TypeScript checks
npm test             # Unit and component tests
npm run build        # Production build in dist/
```

Use `npm run test:watch` during development. Run the database and browser suites against a **disposable local Supabase stack** with the configured default ports. The backend suite uses `psql` and Python 3. Browser tests create test data, so begin with a clean local stack.

```sh
supabase db reset --yes
bash scripts/ci/test-backend.sh
```

```sh
npx playwright install chromium
npm run test:integration
CHROME_PATH=/path/to/chrome npm run test:pwa
```

The PWA harness needs a Chromium executable at `CHROME_PATH` and defaults to `/opt/google/chrome/chrome`. Both browser scripts accept `LOCAL_SUPABASE_CLI` if the CLI is outside your PATH. GitHub Actions runs the [frontend](.github/workflows/frontend-ci.yml) and [backend](.github/workflows/backend-ci.yml) checks.

## Deploy

Build with the target project’s public Supabase variables and serve `dist/` over HTTPS. Configure the host to rewrite client routes such as `/reset-password` and `/opportunities/:id` to `index.html`. In Supabase Auth, enable email/password, set the frontend Site URL, and allow the deployed confirmation and recovery redirects. Configure SMTP for email delivery on hosted environments.

The backend requires the tracked migrations, private Storage policies, curated catalogue data, and periodic readiness processing. Follow the [release procedure](docs/deployment.md) for hosted changes and the [scheduler runbook](docs/readiness-scheduling.md) for worker provisioning.

## Repository layout

| Path | Contents |
| --- | --- |
| [`src/pages/`](src/pages/) and [`src/components/`](src/components/) | App routes and shared UI |
| [`src/services/`](src/services/) and [`src/db/`](src/db/) | Backend access, sync, readiness reads, and IndexedDB |
| [`supabase/`](supabase/) | Local configuration, database migrations, seed data, and SQL tests |
| [`scripts/ci/`](scripts/ci/) | Backend suites and browser checks |
| [`scripts/readiness/`](scripts/readiness/) and [`ops/readiness/`](ops/readiness/) | Readiness job runner and service configuration |
| [`docs/`](docs/) | API contracts, implementation notes, and release runbooks |

## Contributing

Open a GitHub issue for a bug or feature proposal, or submit a focused pull request with verification steps. For catalogue changes, cite the organiser’s primary source and identify the relevant cycle or deadline. Add database changes as new migrations so existing installations can upgrade. See the [opportunity source policy](docs/opportunity-sources.md).
