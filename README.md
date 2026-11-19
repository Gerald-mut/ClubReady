# ClubReady 254

Mobile-first club records for grassroots football in Kenya. Phase 3 adds email/password
authentication, club onboarding/profile management, and private club documents to the
existing React + TypeScript + Vite app.

Phase 4 adds local PlayProof activity recording; Phase 5 adds cloud sync with local
copies retained. Phase 6 adds a sourced opportunities catalogue, supplied-information
comparisons and club application tracking. Persisted readiness and evidence-package
generation remain future work.

## Installation and local development

Backend team: see the [app-wide integration handoff](docs/backend-handoff.md)
for existing service contracts, deployment prerequisites, activity sync gaps and
the deferred Phase 7 readiness engine requirements.

Opportunity details include an opt-in **Readiness preview** with fictional sample
requirements, statuses and supporting items. Admins can simulate a tournament
through **Recompute sample assessment**. This preview does not use club evidence,
create activities, save results or call a backend readiness service.

Use Node.js **22.12+** and npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Edit `.env.local` with your Supabase project's public configuration:

```dotenv
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Get these values from the Supabase project connection/API settings. The old
`VITE_SUPABASE_ANON_KEY` variable is no longer used. Restart Vite after changing env values.
Never put service-role/secret keys, database passwords or privileged connection strings
in `VITE_*` variables: Vite embeds them in browser code. Local env files are gitignored;
`.env.example` contains placeholders only. Without valid configuration the app displays
a setup message instead of attempting protected operations.

```sh
npm run lint
npm run typecheck
npm test
npm run test:watch
npm run build
npm run preview
```

## Supabase database setup

Create a Supabase project or use a local Supabase instance. This repository's existing
CLI linkage files may refer to an earlier project: explicitly verify the target before
running any remote command. No remote database changes were applied during this work.

Apply these migrations in order:

1. `supabase/migrations/202611070001_phase3.sql`: schema, RPC, RLS and initial Storage policies.
2. `supabase/migrations/202611070002_document_storage.sql`: private bucket configuration
   and explicit member-read/admin-upload/admin-delete Storage policies.
3. `supabase/migrations/202611070003_club_membership.sql`: membership and invitation RPCs.
4. `supabase/migrations/202611080001_activity_sync.sql`: immutable activities, attachment metadata and private activity media.

Together they provide:

- `clubs`, validated profile fields, timestamps and an `updated_at` trigger.
- `club_members`, composite membership key and administrator/member roles.
- `evidence`, immutable ownership/metadata and initial `supplied` status.
- Atomic `create_club(...)` RPC, RLS policies, private bucket and Storage policies.

With the Supabase CLI installed, from the repository root:

```sh
# Local: creates config.toml if you have not initialized this checkout yet.
supabase init
supabase start
supabase migration up --local

# Hosted: verify this is the intended project before linking/pushing.
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push --dry-run
supabase db push
```

Alternatively run both migration files in order through the Supabase SQL Editor using its trusted
administrator connection, and track it as applied before later using CLI migrations.
Do not run destructive resets on a hosted database. If matching tables already exist,
review and reconcile their schema before applying these migrations; the schema migration does
not drop or replace existing tables.

The `private` schema must stay outside the Data API's exposed schemas. Its helpers use
fully qualified names and empty search paths; execution is restricted to authenticated
users. Membership reads do not recursively invoke membership policies. Browser clients
cannot insert, update or delete memberships, directly create clubs, alter evidence
ownership or mark documents verified. Only the RPC assigns the creator `club_admin`.

Administrators edit profile fields and upload/delete documents; members read their own
club profiles, memberships and evidence. Unrelated clubs have no access. No membership
invitation or role-management interface is included: additional members must currently
be provisioned through a trusted administrator operation, never a public client role.
For multiple memberships, the app selects the earliest `joined_at`, then `club_id`.

## Authentication configuration

In Supabase **Authentication**:

1. Enable the Email provider and email/password signups. Set minimum password length
   to at least 8 to match the UI. Enable email confirmation if desired.
2. Set **URL Configuration → Site URL** to the deployed app's origin.
3. Add exact redirect URLs for each deployment, including:
   `http://localhost:5173/sign-in`, `http://localhost:5173/reset-password`,
   `https://YOUR_DOMAIN/sign-in`, and `https://YOUR_DOMAIN/reset-password`.
4. Keep the standard confirmation/recovery email links pointing through Supabase's
   verification endpoint, which redirects to the supplied application URL. Configure
   a production SMTP provider before relying on delivery at scale.

Signups without an immediate session show email-confirmation instructions. Sign-in
restores the session automatically; users without a club go to `/club-setup`, while
members go to `/club-profile`. Password recovery stays on `/reset-password`, including
when the recovery link establishes an authenticated session. Expired links can be
re-requested at `/forgot-password`. A signed-in user may also change their password
from the reset page. Sessions persist through the official Supabase JS client; logout
removes the active session and unmounts account-specific UI state.

## Private document storage

The migrations create or configure **club-evidence** as a private bucket with:

- Maximum file size: **5,242,880 bytes (5 MiB)**.
- Allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`.
- Object paths: `<club UUID>/<generated UUID>.pdf|jpg|png`.
- Member reads and administrator inserts/deletes enforced by Storage RLS.
- No object overwrite/update policy; corrections use delete and upload.

If bucket creation is unavailable in your environment, create it in **Storage → New
bucket**, name and ID `club-evidence`, leave **Public bucket off**, and set the size/MIME
limits above. The bucket INSERT/ON CONFLICT statement in the migration may then be
omitted only if that configuration is already set manually; apply all remaining SQL,
including the `storage.objects` policies. Review existing policies: PostgreSQL permissive
policies combine with OR, so unrelated broad policies must not grant this bucket access.
Creating a bucket alone does not install the access policies.

Documents are labelled **Supplied**, never independently verified. View/download actions
request a signed URL valid for 60 seconds; anyone holding that URL can use it until it
expires. The interface removes it after 55 seconds. Metadata is saved after successful
upload; a failed metadata write triggers file cleanup. If cleanup also fails, the error
includes the orphan path for a trusted administrator to remove through Storage.

Deletion removes the file before metadata. If metadata deletion fails, retry deletion;
the record remains visible so cleanup can finish. Storage and PostgreSQL do not share a
transaction: a browser crash or ambiguous network response can leave orphan files or a
record whose file is missing. Reconcile these through the Storage dashboard. File type
checks use extension/MIME and bucket limits, not antivirus scanning or binary inspection.

## Tests

Unit/component tests use Vitest, Testing Library and jsdom with mocked Supabase boundaries.
They cover authentication, session restoration, route guards, recovery, onboarding,
profile editing, account switching, role-specific controls, upload validation, signed
URLs, failed-upload cleanup and confirmed deletion.

```sh
mkdir -p .codex-logs
npm test > .codex-logs/test.log 2>&1
# Only if the command fails:
tail -n 30 .codex-logs/test.log
```

Run all SQL security suites **only on a disposable Supabase test database**, after all migrations:

```sh
mkdir -p .codex-logs
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/phase3_security.sql \
  -f supabase/tests/document_storage.sql \
  -f supabase/tests/club_membership.sql \
  -f supabase/tests/activity_sync.sql > .codex-logs/sql-security.log 2>&1
# Only if the command fails:
tail -n 30 .codex-logs/sql-security.log
```

Use the local Supabase database URL or a private test project's connection URL; keep it
out of frontend env variables and version control. The script creates two unrelated
clubs and a read-only member, switches database roles/JWT subjects, asserts isolation,
admin-only writes, immutable ownership, private file access and anonymous denial, then
rolls back fixtures. It uses psql directives; run it with psql, not the SQL Editor.

The Storage suite also checks bucket privacy/limits, orphan cleanup, malformed paths
and forged ownership. SQL policy assertions do not test uploaded bytes, the Storage
API, email delivery or signed-link expiry. Those require a full Supabase instance.

See `docs/build-log.md` for the latest actual results and limitations;
`docs/test-results.md` records the earlier Phase 3 baseline.

## Manual Supabase checklist before deployment

Remote completion is unverified. Confirm each item against the intended project:

- Create or confirm the Supabase project and copy its public URL/publishable key into
  local and deployment environment settings.
- Apply both migration files above in order; verify their migration history.
- Confirm the `club-evidence` bucket was created by the migrations, remains private,
  has the size/MIME limits above and has the Storage policies installed. If automatic
  creation is unavailable, create/configure the bucket manually as described above.
- Enable Email authentication and configure password length/confirmation and production
  SMTP as needed. Set Site URL and the exact local/deployment `/sign-in` and
  `/reset-password` redirect URLs listed above.
- Run both SQL suites on a disposable full Supabase instance, then verify signup,
  recovery, two-account isolation and real upload/view/download/delete including expiry.

## Structure and deployment

- `src/contexts/`, `src/hooks/`: authentication and selected club membership.
- `src/pages/auth/`, `src/pages/club/`: auth forms and onboarding.
- `src/pages/ClubProfile/`: club display/editing, preserving the existing route.
- `src/components/club/`, `src/components/documents/`: reusable forms and private files.
- `src/services/`: Supabase client, club RPCs and document operations.
- `src/types/club.ts`: server-backed Phase 3 models, separate from legacy Dexie types.
- `supabase/migrations/`, `supabase/tests/`: schema/security and SQL assertions.

Deploy `dist/` over HTTPS with an SPA rewrite to `index.html`, including auth routes.
Set the two public build-time variables in the deployment environment before building,
and configure Supabase redirect URLs for the actual deployment origin. Apply migrations
before releasing the frontend. Never deploy the existing 501 Edge Function stubs as
production implementations.

The existing PWA precaches the app shell only, not Supabase responses or documents.
Phase 3 server-backed reads and writes require connectivity. Phase 4 caches the last
selected club per account for offline PlayProof access; activity records and images
stay on the device and are filtered by the signed-in account and club. Signing out
hides these records; signing in again requires connectivity. No sync requests run.
Test email delivery, signed file links and two real accounts against the target
Supabase instance before production release.

## Club membership management (Phase 3.5)

Apply `supabase/migrations/202611070003_club_membership.sql` after the two Phase 3
migrations. On a disposable test database, also run
`supabase/tests/club_membership.sql` with `psql -v ON_ERROR_STOP=1`; save output under
`.codex-logs/`. No hosted migration is applied by the frontend.

The club profile's Members section lists account IDs and roles without looking up
registered emails. Administrators can generate member/admin invitations, copy the
one-time link, revoke invitations, and confirm promotions, demotions or removals.
The database prevents removal or demotion of the last administrator. Members have
read-only controls. Raw invitation tokens cannot be retrieved again from the database.

Use **Join a club** to paste a code or same-site invite link, or open `/join/:token`.
Signed-out visitors continue through sign-in or sign-up and return to the invitation;
joining requires explicit confirmation. Verify that deployed email-confirmation
redirects preserve the `/sign-in?next=...` return path with your Supabase URL settings.
Invitations expire after seven days and have one use. Existing members keep their
current roles. Invalid, expired, revoked or unavailable invitations show an error.
Sharing an administrator invite grants significant access; share only with its intended
recipient and revoke unused invitations when appropriate.

After joining, the invited club is selected for the current session. Refreshing the
page retains the existing earliest-membership selection behavior; no club switcher is
included. Run `npm test` for frontend membership/join/auth-return coverage, then verify
these flows with real accounts and email delivery against your Supabase test project.


## PlayProof activity recording and cloud sync (Phase 5)

Open the app online, sign in, and load your club before going offline. Record training,
matches, tournaments, community or other activities at `/play-proof`. The date,
location, title and whole participant count (at least 1) are required; notes and up to
three images are optional. Images are resized and encoded as JPEG at no more than
1 MiB each. Save failures retain the form for retry. Records always start as **Saved
locally**. Online records then sync automatically. Records can be edited or deleted
until their first sync attempt. Once sync starts they stay unchanged, including
after failure, because a server write may have succeeded before its response was lost.

The client-generated `crypto.randomUUID()` is the permanent activity ID for
server idempotency. Edits preserve both ID and creation timestamp. Activity metadata
and image Blobs commit atomically to separate IndexedDB tables. Records survive app
closure but are device/browser specific; clearing site data, private browsing cleanup,
or browser storage eviction can remove them. Logging out hides local records rather
than deleting them. Cached club membership supports local access only and does not
establish current server authorization; server-backed features still enforce RLS.

Dexie database `clubready-254` is now schema **3**. Version 1 remains declared so
existing installations upgrade in place. Version 2 preserves activity IDs, maps
`clubId`/`occurredAt` to `club_id`/`date`, adds status and detail defaults, adds Blob
attachments and account-keyed club selections, and removes the unused pending outbox.
Version 3 adds persisted attempts, retry deadlines and errors, and recovers interrupted
uploads without changing IDs or image Blobs.
Legacy rows without an owner remain retained but hidden; do not infer or assign an
owner automatically. Future changes must add a new version and explicit upgrade
with migration tests, preserving IDs and existing Blobs. Never delete/recreate the
production database as a migration strategy.

The existing PWA precaches the app shell and provides SPA navigation offline after
the service worker finishes installation. Production requires **HTTPS** (localhost
is supported for development). Test the built app via `npm run build` and
`npm run preview`; the development server does not install the production worker.
Wait for “ClubReady is ready to open offline” before disconnecting.

Manual acceptance: sign in and open PlayProof online, enable airplane mode, save an
activity with images, close all app tabs, then reopen `/play-proof` while still
offline. Verify the entry, images and **Saved locally** badge remain; edit and delete
while offline, reopen and verify those changes persist. Reconnect and verify each
remaining activity becomes **Synced** with exactly one cloud row per UUID. Repeat
**Sync now** and confirm row/object counts stay unchanged. Verify images and history
remain readable after going offline again. Offline access requires a restorable signed-in session; an
expired session may require reconnecting to authenticate.

`src/test/activities.test.tsx` uses fake-indexeddb for database reopen persistence,
Blob storage, permanent IDs, ownership isolation, locked statuses, deletion,
migration and validation. A component test saves offline and restores the history
after remount. Real service-worker installation and device airplane mode still need
the manual browser acceptance above.


### Sync setup and behavior

Apply `supabase/migrations/202611080001_activity_sync.sql` after the three existing
migrations. Run `supabase/tests/activity_sync.sql` with the existing SQL suites
against a disposable database. The private `activity-media` bucket is provisioned
by the migration with JPEG/PNG and 5 MiB limits; recorder images remain compressed
JPEGs of at most 1 MiB. Paths are `{club_id}/{activity_id}/{attachment_id}.jpg`.

Sync runs on save, when reconnecting, every 30 seconds while the app is open and
online, and through **Sync now** or **Retry sync**. Automatic retries respect a
persisted exponential delay of 1 second up to 5 minutes, checked by those triggers;
manual retry bypasses the delay. Concurrent triggers share one promise. Browsers
with Web Locks also serialize sync between tabs. No Background Sync API is used.

Images upload first without overwrite. An existing image is downloaded and checked
against local bytes. Activity and attachment inserts ignore duplicate UUIDs, then
server data is re-read and compared before the local activity becomes **Synced**.
Partial failures retain all metadata and Blobs for retry. Activity rows can appear
before attachment metadata is complete; **Synced** requires both to be confirmed.
No local activity or photo is deleted by sync. Session expiry pauses uploads and
offers **Sign in again**. Account/club changes stop later operations from the old
run; records belonging to other accounts or clubs are never selected for upload.

The collapsible Activity sync section shows global sync progress/errors and each entry shows its status and
retry error. Orphan uploads remain private; trusted cleanup and evidence linking
are future work. This phase does not pull another device's history into IndexedDB.

Frontend coverage includes lost responses after commit, duplicate retries, partial
attachment/metadata failures, reopen persistence, offline/online and interval
triggers, single-flight execution, auth expiry, account changes, cloud mismatches,
SDK request options, UI badges and retry/re-login controls. Before deployment, use
real Supabase accounts and a mobile browser to repeat airplane-mode acceptance,
interrupt a request after upload, expire the session mid-sync, retry repeatedly,
and confirm one row per UUID and unchanged image bytes. Confirm cross-club denial
and actual Storage MIME/size enforcement through the Storage API.


## Opportunities catalogue and readiness (Phase 6)

Apply these after the three Phase 3/3.5 migrations, in this order:

1. `supabase/migrations/202611080001_activity_sync.sql` (Phase 5 prerequisite)
2. `supabase/migrations/202611080002_opportunities.sql`
3. `supabase/migrations/202611080003_opportunity_assessments.sql`
4. Run `supabase/seeds/opportunities.sql` through a trusted database connection.

Local `supabase db reset` replays all migrations and loads the configured seed
automatically. Frontend deployment does not seed Supabase. Hosted migration and
catalogue changes require a separately reviewed release against verified database
history; do not bypass migration tracking with ad hoc SQL Editor changes.

See [deployment setup and release gates](docs/deployment.md) for frontend/backend
CI, SQL test discovery, required GitHub protections and the disabled manual release
review template. Passing CI does not authorize or trigger production deployment.

The directory lists five programmes: SASDF, FIFA, Safaricom Chapa Dimba, UEFA and
GlobalGiving. Search and filter by type, availability and country/scope. The old
Laureus entry is archived without deleting its tracking. UUIDs and organiser/cycle
slugs remain stable. Seed revision 2 is safe to rerun; it upgrades only earlier
curation revisions and preserves subsequent trusted edits.

Details show cycle-specific sources, rules, supporting documents, application
steps and known verification gaps. Availability, eligibility and confirmed-document
readiness are separate. Old calls never become open automatically. Stale reviews,
unknown windows or unconfirmed routes suppress application links. GlobalGiving is
a fundraising platform, not a direct grant. See `docs/opportunity-sources.md` for
source-review results, including unverified Safaricom and GlobalGiving details.

The deterministic readiness view uses optional self-reported boolean and aggregate
answers, cleared on navigation/account/club/role changes. These are not saved to the
club profile or sent to a new API. It uses the existing club-authorised evidence
query; no assessment document copies or sensitive personal fields are stored.
Missing or unverified information is unknown. Known contradictions of verified
mandatory rules can yield an ineligible assessment under those answers; organiser
approval is never implied. Supplied uploads have no validation status and cannot
count as confirmed documents. Conditional documents are excluded when inapplicable.
Local activity counts cover only this account, club and device and never prove
programme frequency or legal compliance. Chapa Dimba identity/consent documents
belong only on the organiser's platform; no such collection fields were added.

Club administrators can save application status and bounded notes; members see
tracking read-only. Saving never submits an application. Catalogue, document and
tracking reads need connectivity; load errors offer retry, and failed saves retain
drafts. Existing navigation, authentication, uploads and PlayProof are preserved.

Maintainers curate via trusted SQL, not club-admin client writes. For a new cycle,
create a new programme/cycle or increment rule versions and retire prior current
rules; retain historical records and sources. Record official URL, publisher,
location, cycle, verification date and next review date. Use needs_verification
when a source is inaccessible. Add an application URL/open status only after
checking a live official call and exact window. Trusted edits to catalogue, rules
and requirements are recorded in `private.opportunity_audit`. Repeat seeding does
not overwrite revision-2 records; future seed revisions require deliberate review.

Run `npm test`, `npm run lint` and `npm run build`. On a disposable database, apply
all migrations and seed twice, then run `supabase/tests/opportunities.sql`,
`supabase/tests/opportunity_assessments.sql` and the three earlier SQL suites.
Frontend tests mock data-access boundaries. Before deployment, check real two-club
Supabase permissions, first/subsequent tracking saves, source links, mobile layout,
keyboard filters, offline recovery and the new hosted migration/seed. No hosted
migration, browser/device acceptance or document validation is claimed.


## Minimalist interface

The visual system follows `docs/design-spec.md`: white canvas, near-black actions,
quiet grey cards and small muted-orange accents. Shared tokens and controls live in
`src/index.css`; `AppShell`, `Icons` and `ui` provide reusable layout and primitives.
Home (`/`) shows real scoped statistics, a PlayProof action and catalogue previews.
The bottom navigation links to Home, PlayProof, Explore and Club; desktop uses the
same links in the header. Account actions, joining and evidence-package access are
available through the profile menu and Club page. Auth routes have no signed-in
navigation. Existing activity counts remain account/club/device-local.
