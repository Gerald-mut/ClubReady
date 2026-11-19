# ClubReady CI and release procedure

Production deployment is disabled. Production schema/history, backups and GitHub
Environment protection have not been verified. A passing CI run authorizes no
hosted change. This procedure does not deploy the frontend hosting application.

## Source and migration baseline

`frontend-dev` is the authoritative application and migration baseline. Validate
changes on `integration/backend-readiness`, then use the normal reviewed integration
process. Do not import foundation's `20261107190000_init_schema.sql`, old activity
RPC or Edge Function unchanged. They conflict with the current frontend schema.
Never edit migrations already applied to a database; corrections are additive.

`supabase/config.toml` retains `sql_paths = ["./seeds/opportunities.sql"]`.
Local reset runs this curated seed automatically. A hosted migration push does
not seed unless `--include-seed` is explicitly requested; catalogue changes need
their own reviewed data-change plan. Do not assume local reset mirrors an upgrade
of an existing production database.

## Validation workflows

Both CI workflows run on pull requests, pushes and manual dispatch without hosted
credentials, project linking or deployment steps. They use read-only repository
permissions and ephemeral GitHub-hosted Ubuntu runners.

- `.github/workflows/frontend-ci.yml`: Node 22, `npm ci`, `npm run lint`,
  `npm run typecheck`, `npm test`, `npm run build`. The test script is already
  `vitest run`; `test:watch` is deliberately excluded. Build needs no real project
  keys. No privileged key may be passed to Vite.
- `.github/workflows/backend-ci.yml`: pinned Supabase CLI 3.0.0, local startup,
  `supabase db reset --yes`, then `bash scripts/ci/test-backend.sh`. Cleanup removes
  only the ephemeral local stack's volumes. No hosted reset is permitted.
- `scripts/ci/test-backend.sh`: uses only `127.0.0.1:54322` with the standard local
  database credentials. Replays the seed to check repeat safety, then discovers
  every root `supabase/tests/*.sql` file and runs `psql -X --set=ON_ERROR_STOP=1`.
  The six existing suites raise SQL exceptions and use psql meta-commands; they
  are not pgTAP suites and must not be mistaken for TAP output.
  For these rollback-only fixtures, each local psql session sets
  `storage.allow_delete_query=true`: current Storage's `protect_delete()` guard
  otherwise rejects direct metadata deletes before the suites can test RLS.
  This session setting leaves RLS active and changes no server policy. It is
  restricted to the fixed local connection, never a hosted cleanup procedure.
- `supabase test db supabase/tests/database` runs pgTAP separately. Explicitly
  naming the directory avoids depending on default discovery. Add new TAP suites
  there; the initial `schema.test.sql` checks current contracts and seeded data.
  Both runners fail the workflow on errors, and SQL fixtures roll back.

To reproduce, install CLI 3.0.0 using the official installation method, Docker,
Node 22 and `psql`. On a disposable checkout with no hosted credentials:

```sh
supabase --version
supabase start
supabase db reset --yes
bash scripts/ci/test-backend.sh
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The reset destroys the local stack's application data. Use a separate checkout
and unique local `project_id` if an existing local database must be retained.

## Verified CLI syntax

CLI 3.0.0 was installed under `/tmp` during implementation and its actual help
was inspected for reset, database tests, push, migration listing, function deploy
and stop. Do not substitute `latest` in CI.

| Command | Verified 3.0.0 behavior |
| --- | --- |
| `supabase db reset --yes` | Local by default; configured seed runs unless `--no-seed` is supplied. |
| `supabase test db supabase/tests/database` | Accepts explicit test paths; local by default. |
| `supabase migration list --remote` | Lists linked hosted migration history. |
| `supabase db push --remote --dry-run --skip-vault` | Reviews pending migrations without applying; explicitly excludes Vault updates. |
| Hosted database mutation, after separate approval | Requires `--remote` to select hosted state and `--yes` for unattended mutation. Neither is authorization. |
| `supabase functions deploy <name> --yes` | Remote-only; omitting names deploys all functions. Never omit names. |
| `supabase stop --no-backup` | Local only; deletes local volumes. Only appropriate for disposable CI. |

This version has no `--local` flag on `db reset` or `test db`; omitting `--remote`
selects local. Help inspection is not a hosted integration test. See the official
[v3 migration guide](https://supabase.com/docs/guides/local-development/cli/migrating-to-v3)
and [local/hosted targeting guide](https://supabase.com/docs/guides/local-development/local-and-hosted-projects).

## Disabled release review template

`.github/workflows/backend-release-review.yml` is manual-only and its sole job has
literal `if: ${{ false }}`. It cannot contact production as committed, even if
secrets exist or an Environment is approved. It has no migration apply step and
no function deployment step. Removing the hard stop requires explicit owner
approval and a reviewed YAML change. Do not add a CI-success, push or
`workflow_run` deployment trigger.

After approval to perform hosted review, enable only the review job. Dispatch on
`frontend-dev`; its source guard rejects other refs. The job checks out the event's
immutable SHA, links the fixed project and runs:

```sh
supabase migration list --remote
supabase db push --remote --dry-run --skip-vault
```

These commands are documented, not executed as part of this implementation.
GitHub exposes manual dispatch only when the workflow exists on the repository's
default branch; arrange that through the normal reviewed integration process.
Do not merge or change the default branch solely to bypass the release gate.
Linking and dry-run still access hosted resources and need separate authorization.
Review output alongside the exact SQL diff; dry-run does not prove RLS correctness,
data compatibility, lock duration or absence of schema drift. If history contains
foundation's init migration, missing local versions or unexplained differences,
stop and prepare an explicit upgrade plan. Do not force `--include-all`, repair
history or reset production to make the output pass.

Record the commit SHA, project ref, pending migration list, SQL review, staging
results and backup reference in a release record. A human must approve that exact
release after the dry-run. Any future apply workflow must be a separately reviewed
manual design, recheck the same SHA/history and require a protected apply
Environment approval after review. There is deliberately no executable apply
command in the current workflows. Do not turn review success into automatic apply.

## GitHub setup required before hosted review

An administrator must configure these in GitHub UI; YAML cannot create or prove
them. Leave hosted credentials absent until the project and protections are checked.

1. Under **Settings → Environments**, create `production`. Configure required
   reviewers independent of the initiating developer, prevent self-review, and
   disable administrator bypass where supported. Confirm the repository plan
   supports the required protection features; if it does not, keep the job disabled.
2. Restrict deployment branches/tags to the selected branch `frontend-dev`, with
   no tag allowance. Verify another branch cannot obtain Environment credentials.
   Change both UI rules and the YAML source guard together if release policy changes.
3. Under **Settings → Secrets and variables → Actions → Variables**, set repository
   variable `SUPABASE_PROJECT_ID` to the independently verified project ref. It is
   not a credential. Repository scope lets workflow-level concurrency resolve it
   before a job enters an Environment. Do not accept a project ref as dispatch input.
4. Store `SUPABASE_ACCESS_TOKEN` and `SUPABASE_DB_PASSWORD` as **production Environment
   secrets**, never repository-wide CI secrets. Use a dedicated operator token with
   the minimum practical project access and rotation policy. Password is supplied
   through the environment, never command arguments. No service-role key is needed.
5. Protect `frontend-dev` with a ruleset requiring review and the exact checks
   `Frontend validation` and `Local Supabase validation`, current commits, and no
   force pushes/deletion. Require designated maintainers to review workflow and
   migration changes (configure ownership/rules in the repository). Confirm the
   checks' displayed names after the first GitHub run before making them required.
6. Limit Actions/workflow editing and release dispatch access. Retain release review
   records securely. Do not enable shell tracing, dump environments, print CLI
   credentials or upload token/config/database dumps as public artifacts.

YAML enforces manual-only review, literal disablement, fixed source guard,
read-only repository permissions, SHA checkout and no apply/function commands.
`environment: production` only references UI protection; it does not establish it.

The review concurrency group is `supabase-production-<SUPABASE_PROJECT_ID>` with
`cancel-in-progress: false`, shared across branches. Every future review/apply
workflow targeting this project must use that identical group. GitHub groups are
repository-scoped and serialize runs, not external operators or other repositories;
coordinate those separately. Ordering is not a deployment queue guarantee. The
`unconfigured` fallback does not authorize a target; the job rejects an empty ref.

## Edge Function allowlist

The production-ready allowlist is currently **empty**. Neither function is deployed:

- `supabase/functions/process-readiness/index.ts`: HTTP 501 stub.
- `supabase/functions/sync-activity/index.ts`: HTTP 501 in the current baseline;
  foundation's implementation uses the obsolete payload/schema. Current browser
  sync uses direct PostgREST/Storage instead.

Do not deploy all functions, use `--prune`, disable JWT verification, or infer
readiness from a directory existing. A future addition needs explicit named
allowlisting, authentication/authorization tests and separate release approval.

## Backup, recovery and release verification

Before any future apply, the operator must verify actual hosted schema/history and
Storage/Auth configuration, rehearse the upgrade on staging, and confirm a recent
recoverable backup/PITR point, retention, recovery owner and agreed recovery time.
Test restoration in an isolated project. Database backup alone does not establish
recovery of Storage object bytes; verify and document object backup separately.
Record a known-good application commit and all function/config versions.

Prefer additive migrations compatible with the previous frontend. For failure,
stop the rollout, preserve logs without sensitive data, and assess a reviewed
forward repair. Application rollback does not undo database changes. Destructive
rollback or restoring a backup requires explicit incident approval and a plan for
writes since the recovery point. Never use a hosted reset as recovery.

After any separately authorized release, verify migration history matches the
approved list; check Auth confirmation/recovery redirects, club creation/profile,
invite redemption and last-admin protection, private document upload/read/delete,
activity/attachment retry acknowledgments, catalogue and tracking. Exercise two
clubs plus admin/member/outsider/anonymous boundaries using designated test data.
Check that unapproved functions remain untouched and inspect database/Auth/Storage
errors. A dry-run with no pending migrations supplements these checks; it does not
replace them. Hosted tests can mutate fixtures and require their own authorization.

## Implementation verification record

On 2026-11-08, the clean `npm ci` sequence passed lint, typecheck, all 135 tests
across 14 files, and build on Node 22.23.1/npm 10.9.8. Build reported the existing
large-bundle warning. YAML parsing, workflow shell syntax and seed/port consistency
checks passed. Actionlint 1.7.12 passed after excluding only its expected diagnostic
for the intentional literal-false release condition; that hard stop was retained.

CLI 3.0.0 local startup, migration reset with configured seed, repeat seed, all six
SQL assertion suites and the pgTAP suite (10 assertions) passed against a separate
`ClubReadyCIValidation` stack copied into `/tmp`. The first SQL run exposed the
current Storage delete guard; the session-only fixture adjustment above resolved
it, and the complete reset/test sequence then passed. No applied migration changed.
The isolated stack was stopped and its disposable volumes removed successfully.

GitHub workflow execution, Environment configuration, production history, remote
dry-run, backups and post-deploy verification remain unverified. No hosted resource
was accessed or changed while implementing these files.
