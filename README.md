# ClubReady 254

Mobile-first club records for grassroots football in Kenya. Phase 3 adds email/password
authentication, club onboarding/profile management, and private club documents to the
existing React + TypeScript + Vite app.

PlayProof, opportunity readiness, evidence-package generation and offline synchronization
remain future work. Their existing pages and scaffolding are preserved.

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

The migration is `supabase/migrations/202611070001_phase3.sql`. It adds:

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

Alternatively run the migration once through the Supabase SQL Editor using its trusted
administrator connection, and track it as applied before later using CLI migrations.
Do not run destructive resets on a hosted database. If matching tables already exist,
review and reconcile their schema before applying this migration; it deliberately does
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

The migration creates or configures **club-evidence** as a private bucket with:

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
npm test > /tmp/test.log 2>&1
# On failure, inspect only the tail if desired:
tail -n 30 /tmp/test.log
```

Run SQL security tests **only on a disposable Supabase test database**, after migration:

```sh
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/tests/phase3_security.sql > /tmp/test.log 2>&1
```

Use the local Supabase database URL or a private test project's connection URL; keep it
out of frontend env variables and version control. The script creates two unrelated
clubs and a read-only member, switches database roles/JWT subjects, asserts isolation,
admin-only writes, immutable ownership, private file access and anonymous denial, then
rolls back fixtures. It uses psql directives; run it with psql, not the SQL Editor.

See `docs/test-results.md` for actual verification and remaining live-service checks.

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
Phase 3 reads and writes require connectivity. Dexie activity/outbox scaffolding is
unchanged and is not used to cache authenticated club data. Before enabling future
offline records, implement account isolation, logout cleanup and synchronization.
Test email delivery, signed file links and two real accounts against the target
Supabase instance before production release.
