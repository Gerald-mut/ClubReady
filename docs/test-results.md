# Phase 3 verification

Verified during implementation on 2026-11-07 using Node.js 22.23.1.

| Check | Actual result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed, including production Vite/PWA output |
| `npm test` | Passed: 44 tests across 3 files |
| `git diff --check` | Passed |
| `supabase/tests/phase3_security.sql` | Passed on isolated PostgreSQL 18.6 with minimal Supabase-compatible Auth/Storage schema |
| `npm audit --omit=dev --audit-level=high --json` | Passed: no production dependency vulnerabilities reported; output saved to `/tmp/audit.json` |

Automated test and final SQL assertion output is saved to `/tmp/test.log` in this
workspace session. Build, lint and typecheck output is saved separately in
`/tmp/clubready-build.log`, `/tmp/clubready-lint.log` and `/tmp/clubready-typecheck.log`.
These temporary files are not committed.

The migration was successfully applied to an isolated PostgreSQL instance in `/tmp`.
Its minimal compatibility schema supplies auth.uid(), auth.users, storage.buckets and
storage.objects plus representative roles/grants. This exercises real PostgreSQL
constraints, functions, privileges and RLS; it is **not** a running Supabase service.
SQL test fixtures are rolled back. No remote project migrations or configuration
changes were made.

Coverage includes signup confirmation, sign-in/errors, recovery/password reset,
session restoration and stale restoration races, route guards, onboarding/profile
editing, duplicate submissions, read-only member controls, account switching,
file validation, private URL requests, cleanup failures and confirmed deletion.
SQL assertions use two unrelated clubs and a read-only member to check club/evidence
isolation, role escalation denial, immutable ownership, administrator writes,
member/anonymous write denial and private Storage object policies.

Not run: real Supabase Auth signup/sign-in/confirmation/recovery emails; full Storage
API upload/download/delete and MIME/size enforcement; signed URL expiry/revocation
behaviour; browser/mobile visual or end-to-end tests. `.env.local` is empty and no
configured Supabase runtime was available. The frontend service tests mock Supabase
boundaries and do not prove live network operations.

Before deployment, apply the migration to a test Supabase instance and run the SQL
script there, then verify the following with two real accounts:

1. Signup with confirmation enabled and disabled, sign-in, refresh/session restoration,
   sign-out and invalid/expired password recovery links.
2. Independent club creation, administrator editing, trusted read-only membership
   provisioning, and denial of every cross-club query/write.
3. PDF/JPEG/PNG upload, oversized rejection, private viewing/download, URL expiry,
   confirmed deletion and partial-failure cleanup.
4. Mobile layouts, accessible keyboard navigation, direct auth route links through
   the deployment SPA rewrite, and recovery redirects on the real domain.
