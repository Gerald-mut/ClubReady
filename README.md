# ClubReady 254

Mobile-first club records for grassroots football in Kenya. Phase 3 adds email/password
authentication, club onboarding/profile management, and private club documents to the
existing React + TypeScript + Vite app.

Phase 4 adds local-only PlayProof activity recording. Opportunity readiness,
evidence-package generation and cloud synchronization remain future work.

## Installation and local development

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

Run both SQL security suites **only on a disposable Supabase test database**, after both migrations:

```sh
mkdir -p .codex-logs
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/phase3_security.sql \
  -f supabase/tests/document_storage.sql > .codex-logs/sql-security.log 2>&1
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


## PlayProof local activity recording (Phase 4)

Open the app online, sign in, and load your club before going offline. Record training,
matches, tournaments, community or other activities at `/play-proof`. The date,
location, title and whole participant count (at least 1) are required; notes and up to
three images are optional. Images are resized and encoded as JPEG at no more than
1 MiB each. Save failures retain the form for retry. Records always start as **Saved
locally**, even online. There is no upload or cloud synchronization in this phase.
Unsynced records can be edited or deleted; uploading/synced records are locked.

The client-generated `crypto.randomUUID()` is the permanent activity ID for future
server idempotency. Edits preserve both ID and creation timestamp. Activity metadata
and image Blobs commit atomically to separate IndexedDB tables. Records survive app
closure but are device/browser specific; clearing site data, private browsing cleanup,
or browser storage eviction can remove them. Logging out hides local records rather
than deleting them. Cached club membership supports local access only and does not
establish current server authorization; server-backed features still enforce RLS.

Dexie database `clubready-254` is now schema **2**. Version 1 remains declared so
existing installations upgrade in place. Version 2 preserves activity IDs, maps
`clubId`/`occurredAt` to `club_id`/`date`, adds status and detail defaults, adds Blob
attachments and account-keyed club selections, and removes the unused pending outbox.
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
while offline, reopen and verify those changes persist. Reconnect and verify no
activity is uploaded. Offline access requires a restorable signed-in session; an
expired session may require reconnecting to authenticate.

`src/test/activities.test.tsx` uses fake-indexeddb for database reopen persistence,
Blob storage, permanent IDs, ownership isolation, locked statuses, deletion,
migration and validation. A component test saves offline and restores the history
after remount. Real service-worker installation and device airplane mode still need
the manual browser acceptance above.
