
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
