
## Steps 3–4: database migration
- What: `supabase/migrations/202611070001_phase3.sql`; added the required plain-English header, preserving the existing schema and behaviour.
- Why: Profiles, composite club memberships and supplied evidence keep club ownership explicit. A SECURITY DEFINER RPC atomically creates the club and authenticated creator's administrator membership; its empty search path and restricted EXECUTE privileges prevent client-selected roles or object shadowing.
- How to verify: On a disposable Supabase database, run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/202611070001_phase3.sql`. Actual result: migration applied successfully on throwaway PostgreSQL with a minimal Supabase-compatible contract; `.codex-logs/migration.log`.
- Known limits/open items: No remote migration was applied. The contract database is not the Supabase Auth/Storage runtime; live Supabase integration remains unverified. Future activity/opportunity relationships are intentionally absent.

## Steps 3–4: existing database policy set
- What: Reviewed the existing club, membership and evidence policies and grants in `supabase/migrations/202611070001_phase3.sql`; policy definitions unchanged in this unit. UI and Storage definitions were left unchanged.
- Why: Membership helpers bypass only the recursive membership lookup with a fixed empty search path. Members read their own club, administrators edit allowed profile fields and insert/delete evidence, and column/table privileges prevent role escalation or changing evidence club/uploader ownership. Metadata corrections require replacement; documents remain supplied.
- How to verify: `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase3_security.sql` after migration. Actual result so far: all policies/functions installed successfully, `.codex-logs/migration.log`; the expanded assertions have not run yet.
- Known limits/open items: This review adds no invitation/role-management feature or future-phase relationships. The security-suite result is recorded separately below after execution.

## Steps 3–4: two-club security suite
- What: `supabase/tests/phase3_security.sql`; extended the existing suite with member-only membership visibility, member evidence-insert denial, and a forced membership foreign-key failure proving club creation rolls back atomically.
- Why: Two unrelated clubs must remain isolated for reads and writes, while a read-only member must not gain administrator capabilities. Failing after the club insert tests the RPC's transaction boundary rather than only rejecting invalid profile input before insertion.
- How to verify: `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/phase3_security.sql`. Actual result: PASS against the migrated throwaway PostgreSQL database on port 55441; `.codex-logs/test.log`. The suite rolled back its fixtures.
- Known limits/open items: The runtime used minimal Supabase-compatible Auth/Storage tables, not the hosted services. Existing Storage assertions ran unchanged; no Storage implementation was added or modified. Run the same script against a disposable full Supabase instance before deployment.

## Prior Phase 3: authentication test suite inventory
- What: Existing `src/test/auth.test.tsx`; documented only, unchanged in the Steps 3–4 continuation.
- Why: Earlier tests cover session restoration, recovery, redirects and authentication failures with mocked service boundaries. These tests are outside the current database-only scope, so they were not rerun or extended here.
- How to verify: `npx vitest run src/test/auth.test.tsx`. Historical result: this file passed as part of the earlier 44-test, 3-file run; preserved output `.codex-logs/phase3-prior-test.log` (copied from `/tmp/test.log`, not a new run).
- Known limits/open items: Mocked tests do not verify Supabase Auth or email delivery. No current-run UI validation is claimed.

## Prior Phase 3: club test suite inventory
- What: Existing `src/test/club.test.tsx`; documented only, unchanged in the Steps 3–4 continuation.
- Why: Earlier tests cover onboarding, profile editing, member controls, account switching and document UI actions. Database security is tested separately with real PostgreSQL permissions, so UI code need not change in this unit.
- How to verify: `npx vitest run src/test/club.test.tsx`. Historical result: this file passed as part of the earlier 44-test, 3-file run; `.codex-logs/phase3-prior-test.log`. Not rerun here.
- Known limits/open items: Service boundaries are mocked; no real browser/mobile or live Supabase outcome is established.

## Prior Phase 3: document service test suite inventory
- What: Existing `src/test/documents.test.ts`; documented only, unchanged in the Steps 3–4 continuation.
- Why: Earlier tests validate file limits, short-lived URL requests, cleanup and deletion failure handling without contacting Storage. Preserving those tests avoids expanding the current database-only scope.
- How to verify: `npx vitest run src/test/documents.test.ts`. Historical result: this file passed as part of the earlier 44-test, 3-file run; `.codex-logs/phase3-prior-test.log`. Not rerun here.
- Known limits/open items: Live private uploads, signed-link expiry and Storage API operations remain unverified.

## Prior Phase 3: test harness inventory
- What: Existing `src/test/setup.ts` and `vitest.config.ts`; documented only, unchanged in the Steps 3–4 continuation.
- Why: The shared jsdom harness provides DOM matchers and cleanup, while the test configuration keeps the existing Vite/PWA build configuration separate from unit testing. Neither file is an independent test suite.
- How to verify: `npm test`. Historical result: the harness supported the earlier successful 44-test run, preserved in `.codex-logs/phase3-prior-test.log`; it was not rerun in this continuation.
- Known limits/open items: These files cannot establish live Supabase integration or browser rendering correctness.

## Steps 2, 5–6: scoped UI completion
- What: Preserved existing authentication, club onboarding and administrator/member profile flows; replaced the profile document interface with an empty placeholder. Fixed a late session-restoration rejection overwriting a newer authentication event. No migrations or Storage implementation changed.
- Why: Keep password recovery state consistent and defer Step 7 while retaining the existing design and frontend publishable-key configuration.
- How to verify: npm test (46 tests across 3 files passed), npm run lint (passed), npm run build (passed); logs: .codex-logs/phase3-ui-test-final.log, .codex-logs/phase3-ui-lint-final.log, .codex-logs/phase3-ui-build.log. Added regressions for the restoration race and the administrator documents placeholder making no storage calls.
- Limits: Tests use mocked service boundaries; live Supabase Auth/email delivery and browser/mobile behavior were not verified. Existing standalone document tests ran unchanged; Step 7 remains disconnected from the profile.

## Step 7: private club document management
- What: Replaced the club profile placeholder with the existing document interface and service: administrator uploads with document types and PDF/JPEG/PNG validation up to 5 MB, supplied metadata, member listing, 60-second signed view/download links, and confirmed administrator deletion. The component remounts when club, account or role changes. Added an accessible documents region and profile integration, progress, retry, download and failure tests. Existing authentication and migration files remain unchanged.
- Storage: Added `supabase/migrations/202611070002_document_storage.sql` to provision the private `club-evidence` bucket and explicitly apply member-read/admin-upload/admin-delete policies, uploader ownership and unique UUID path constraints. No overwrite policy is provided. Existing service cleanup removes uploaded objects if metadata creation fails and reports orphan paths when cleanup fails. Apply this migration after `202611070001_phase3.sql`; automatic bucket creation succeeded in the disposable contract database.
- Validation: `npm test` PASS (49 tests across 3 files), `npm run lint` PASS, `npm run build` PASS. Logs: `.codex-logs/step7-test.log`, `.codex-logs/step7-lint.log`, `.codex-logs/step7-build.log`. The initial new progress test failed to submit via the jsdom button click; corrected it to explicitly submit the form, matching the existing upload test, then the suite passed.
- Database validation: Applied the new migration and ran unchanged `supabase/tests/phase3_security.sql` plus new `supabase/tests/document_storage.sql`: PASS, `.codex-logs/step7-storage.log`. Assertions cover two-club isolation, member restrictions, administrator actions, private bucket limits, orphan cleanup, malformed paths and forged ownership. SQL fixtures rolled back. Sandbox socket restrictions required escalation for local PostgreSQL startup and connection.
- Limits: PostgreSQL used minimal Supabase-compatible Auth/Storage tables; bucket MIME/size settings were asserted, but real Storage API enforcement, uploaded bytes, browser/mobile behavior and signed-link expiry were not exercised. Run the migration and end-to-end upload/view/download/delete checks against a disposable full Supabase instance before deployment. No documents are described as independently verified. No commit created.

## Steps 9–10: test audit and setup documentation
- Scope: Worked on `frontend-dev` only; no commits, application changes, migration changes or security-policy changes.
- Audit: All twelve Step 9 categories already had tests in `src/test/auth.test.tsx`, `src/test/club.test.tsx`, `src/test/documents.test.ts` and the two existing SQL suites. The missing assertion was that upload validation prevents Storage and metadata writes; added four cases for unsupported MIME, unsupported extension, oversize and excessive filename length in `src/test/documents.test.ts`. Existing coverage was preserved.
- Documentation: Updated `README.md` with both migration files in order, both SQL suites, `.codex-logs/` commands, current versus historical verification references, and the manual Supabase checklist. Added public-only configuration guidance to `.env.example`; values remain placeholders. Existing `.gitignore` excludes local environment files and logs.
- Actual validation: `npm test` PASS (53 tests across 3 files), `npm run lint` PASS, `npm run build` PASS, `git diff --check` PASS. Logs: `.codex-logs/step9-test.log`, `.codex-logs/step9-lint.log`, `.codex-logs/step9-build.log`, `.codex-logs/step9-diff-check.log`. No failures occurred.
- Manual Supabase configuration still required/remote completion unverified: create or confirm the intended project; apply `202611070001_phase3.sql` then `202611070002_document_storage.sql`; confirm the migrations created the private `club-evidence` bucket with the documented limits/policies (create/configure manually if automatic creation is unavailable); enable/configure Email authentication and set Site URL plus local/deployed `/sign-in` and `/reset-password` redirect URLs. Supply public URL/key to local and deployment environments; configure production SMTP as needed.
- Limits/next checks: SQL suites were audited but not rerun in this unit; earlier contract-database results remain historical. No full Supabase runtime or credentials were used. Run both SQL suites on a disposable full Supabase instance and verify real signup/email/recovery, two-account isolation, uploads/downloads/deletion, MIME/size enforcement, signed-link expiry and browser/mobile behavior before deployment.

## Phase 3.5: database membership management
- What: Added only `supabase/migrations/202611070003_club_membership.sql` and `supabase/tests/club_membership.sql`, plus this log entry. Earlier migrations and UI are unchanged. Invite tokens use two random UUIDs and SHA-256 hashes; only safe invite columns are selectable by club admins. Checked create/accept/revoke and role/removal RPCs use explicit empty search paths and authenticated-only execution. Direct invite and membership writes remain denied.
- Why: Permit shared-club membership without email lookup or client-selected privilege escalation. Club-row locks serialize membership changes and invite consumption. Single-use invites default to seven days; existing members retain their roles without consuming unused invitations. Successful recipients may retry consumed invitations only while still members; expired/revoked invitations and reuse by other or removed recipients fail. Last-admin demotion/removal is blocked. `used_by` is an additional client-hidden column to distinguish legitimate retries.
- How to verify: After the previous two migrations, apply the new migration to a disposable Supabase database, then run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/club_membership.sql -f supabase/tests/phase3_security.sql -f supabase/tests/document_storage.sql`, redirecting output into `.codex-logs/`. Fixtures roll back. Actual result: new migration and all three SQL suites PASS on the existing disposable PostgreSQL contract database (port 55441); `.codex-logs/phase35-sql.log`. Expanded membership suite with direct invite-write denial and function configuration/grant assertions PASS; `.codex-logs/phase35-membership-final.log`.
- Limits/review: No hosted migration or full Supabase service checks; contract runtime provides minimal Auth/Storage tables. Parallel-session contention was not exercised. No frontend tests, lint or build run for this database-only unit. Initial server status reported stopped (`.codex-logs/phase35-pg-status.log`); startup succeeded with socket escalation (`.codex-logs/phase35-pg-start.log`). Pause for database review before UI work; no commit created.

## Phase 3.5: membership and invite UI
- What: Added `src/components/members/Members.tsx`, `src/pages/club/JoinClub.tsx`, `src/services/members.ts`, `src/services/invite-return.ts` and `src/test/members.test.tsx`. Integrated the Members section into the club profile and join routes/navigation into `src/App.tsx`. Updated auth pages to retain validated invite return paths through sign-in/sign-up and confirmation emails. Extended club context/service refresh to select the newly joined club; retained prior selection on ordinary refresh and fall back to available membership after removal. Updated README with migration prerequisites, usage and limitations. Existing profile tests isolate the new Members component; its behavior has dedicated tests.
- Why: Administrators can choose invite roles, copy one-time links, revoke invitations and confirm role/removal changes; members see the list read-only. No registered-email lookup occurs. Loading/error/retry/success states and pending-action locks support the shared mobile-first design. Only safe invite columns are queried; privileged operations use the reviewed RPCs. Auth return destinations are restricted to `/join` or a valid token route. Member/invite UI resets on club/account/role changes, and join state resets on account changes.
- How to verify: `npm test`, `npm run lint`, `npm run build`, `git diff --check`. Actual final results: PASS, 72 tests across 4 files; lint PASS; build PASS; diff check PASS. Logs: `.codex-logs/phase35-ui-test-verified.log`, `.codex-logs/phase35-ui-lint-verified.log`, `.codex-logs/phase35-ui-build-verified.log`, `.codex-logs/phase35-ui-diff-check.log`. Tests include role visibility, invite creation/copy/revocation, confirmation/cancellation, last-admin errors, join validation/retry/loading, pending submission, sign-in/sign-up return paths and unsafe redirect rejection.
- Corrections: Initial lint failed on a render-time `Date.now()` call and build failed on unsupported test-query `exact` options; failure logs `.codex-logs/phase35-ui-lint.log` and `.codex-logs/phase35-ui-build.log`. Moved the clock into state with timer cleanup and corrected queries. Both passed on subsequent runs; no repeated failure.
- Limits/next checks: Frontend tests mock service boundaries; no live Supabase, clipboard/browser/mobile or email-delivery check was performed. Apply the Phase 3.5 migration to the intended test project and verify real two-user joining, third-user denial, admin changes and confirmation-email return paths with deployed redirect configuration. The joined club is selected for the current session; page reload uses the existing earliest-membership rule and no switcher is included. Database files were unchanged in this UI unit; SQL suites were not rerun. Worked on `frontend-dev`, preserved earlier edits, no commit created.

## Phase 4 — local PlayProof (2026-11-08)

Implemented Dexie v2 with immutable activity UUIDs, account/club-scoped history,
transactional Blob attachments, local status badges, validation, image compression,
and unsynced edit/delete. Cached club selection permits offline route restoration
for a returning signed-in account. The unused cloud sync scaffold is disabled.
Existing PWA app-shell precaching is reused; no opportunities/readiness work added.

Validation: 79 tests passed across 6 files, including fake-indexeddb persistence,
v1 migration, UUID stability, attachment limits/deletion, ownership isolation,
sync-state locks, form validation/offline remount and cached club restoration.
Lint passed. Production build emits the app-shell service worker. The build retains
the existing bundle-size warning. Logs: `.codex-logs/phase4-{tests,lint,build}.log`.
Real-device airplane-mode/service-worker acceptance was not run; README includes
the exact manual procedure, HTTPS requirement, session and local-storage limits.
