# Backend integration handoff

Reviewed against the working tree on 2026-11-08. Branch: `phase7-readiness`,
created from `frontend-dev` with existing uncommitted Phase 6 files preserved.
This is an implementation handoff, not a claim that hosted services are deployed.
Per owner instruction, Phase 7 server integration is deferred to the backend team.
No Phase 7 migration, worker or sync integration is implemented here. A subsequent
owner-authorized frontend preview uses fictional fixtures only, as described below.

## Frontend preview adapter

`src/pages/Opportunities/ReadinessPreview.tsx` is an opt-in section on opportunity
detail. `src/services/readiness-preview.ts` defines its typed adapter and fixtures.
The sample requirements are fictional and deliberately separate from the real
catalogue and existing assessments. Opening loads four sample statuses; admin
Recompute simulates a tournament support item. No request, persistence or real
activity creation occurs. Club/account/role/route changes remount the parent detail
and clear the preview. UI role checks are presentation only, not backend security.

For integration, replace the adapter after agreeing the read/RPC contract. Replace
fixture requirement IDs with real versioned requirements, propagate exact support
IDs, and add authorized support navigation; current sample labels have no file links.
`ReadinessSnapshot.assessedAt` currently timestamps fixture creation, not a server
assessment. It must come from committed evaluation results in production. The
sample summary counts only `supplied`; expiry/applicability denominator decisions
remain pending. Add job/stale state and polling or Realtime, remove the sample-only
simulation, and remove preview labels only after full integration acceptance.

## Current application and integration inventory

The React/Vite app uses Supabase Auth, PostgREST, RPC and private Storage directly;
there is no separate REST application server today. Client contracts live in
`src/services/`, `src/types/club.ts` and `src/contexts/`. Preserve these contracts
or coordinate frontend changes when introducing a separate backend.

| Area / route | Current contract | Backend work and checks |
| --- | --- | --- |
| Authentication: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password` | Supabase email/password signup, login, confirmation, recovery and signout; persistent sessions, token refresh | Configure intended project, email delivery and allowed redirect origins/routes. Exercise confirmation, recovery, expired sessions and revoked access against real Auth. Validate JWTs on every future endpoint. |
| Club setup/profile: `/club-setup`, `/club-profile` | `create_club` RPC atomically creates club and first admin; `clubs` updates; `club_members` queries | Preserve atomic creation, field validation, membership RLS and admin-only edits. Support name, county, nullable sub_county, year_established, description, contact_email; use database audit times. Exact RPC arguments are in `src/services/clubs.ts`. |
| Club selection / offline restoration | Membership lookup by user, optional preferred club, earliest joined fallback; Dexie cached selection keyed by user | Cached role is an offline display aid. Recheck live membership/role on every request, including after removal or demotion. Frontend resets scoped state on account/club changes. |
| Membership and `/join/:token` | `club_members`, restricted `club_invites` projection and RPCs below | Preserve last-admin protections, atomic redemption, role checks, hashed tokens and invite expiry/revocation. Members must not retrieve token hashes or private redemption audit columns. |
| Documents on club profile | `evidence` metadata and private `club-evidence` bucket | Preserve member reads and admin upload/delete, ownership and path checks; test real Storage authorization and partial failure recovery. Expiry exists in DB but current upload UI does not submit it. |
| PlayProof: `/play-proof` | Dexie v2 only; no server activities table or functional sync | Design and implement activity persistence, attachment storage and sync as a separate backend integration. Do not treat local records as uploaded. See activity contract below. |
| Catalogue: `/opportunities`, `/opportunities/:id` | Read-only `opportunities`, current `opportunity_requirements`, current `opportunity_rules`; browser filters/paging | Apply catalogue migrations/seed, preserve source/version history and archive semantics. Client catalogue/rule writes remain forbidden. Trusted audited SQL is the existing maintenance path. |
| Opportunity tracking | `application_tracking` scoped by club/opportunity; admin insert/update, member read | Unique club/opportunity pair; immutable identity; stamp actor/time on server. Frontend reads then inserts or updates, not upserts. Handle concurrent first inserts without duplicate records. |
| Current assessment | `src/services/opportunity-assessment.ts` evaluates sourced rules and optional page-local facts; document/category and local activity counts | This is not persisted readiness. Facts are not sent to an API. Keep availability, sourced rule assessment and evidence presence separate. Do not reinterpret an upload as document validation. |
| Evidence package: `/evidence-package` | Placeholder only | No export, PDF or sharing implementation. Excluded from Phase 7; define a separate contract before building. |
| PWA | App-shell precache, offline activity storage | Auth, document uploads, catalogue and tracking still require services; there is no general offline API mutation queue. HTTPS and real-device offline checks remain necessary. |

## Existing RPCs and access boundaries

Use migrations as the exact signature/security source of truth:

- `create_club(p_name, p_county, p_sub_county, p_year_established, p_description, p_contact_email)` returns club UUID.
- `create_club_invite(p_club_id, p_role)` returns a token;
  `accept_club_invite(p_token)` returns club UUID.
- `revoke_club_invite(p_invite_id)`, `set_member_role(p_club_id, p_user_id, p_role)`
  and `remove_member(p_club_id, p_user_id)` perform protected membership changes.
- Roles are `club_admin` and `club_member`. RLS uses nonrecursive private membership
  helpers. Never authorize using a browser-supplied role, creator or cached selection.
- Browser configuration is `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY`. Privileged service keys stay server-side.

## Documents and file lifecycle

Evidence types: `club_registration`, `coach_qualification`,
`annual_work_programme`, `safeguarding_policy`, `governing_body_resolution`,
`financial_report`, `other`. Current metadata status is only `supplied`.
Files accept PDF/JPEG/PNG, 1 byte through 5 MiB. Private paths are
`<club UUID>/<random UUID>.<pdf|jpg|png>`; uploads cannot overwrite objects.
Signed URLs last 60 seconds and must not be persisted in readiness results.

Upload first creates the object, then metadata; metadata failure attempts object
cleanup. Delete removes the object first, then metadata; failed metadata deletion
requires retry. Backend operations/monitoring must account for orphan objects and
temporarily dangling metadata. Readiness should derive from committed metadata;
define whether file-existence reconciliation invalidates a result. Evidence expiry
editing/import needs an authorized contract: clients currently have no evidence
UPDATE grant and upload does not set `expires_at`.

## Activity and sync contract to agree before implementation

Authoritative frontend shape is `LocalActivity` in `src/services/activities.ts`:

```ts
{
  id: string; club_id: string; created_by: string; createdAt: string;
  activity_type: 'training' | 'match' | 'tournament' | 'community' | 'other';
  title: string; date: string; location: string;
  participants_count: number; notes: string;
  sync_status: 'saved_locally' | 'pending_sync' | 'uploading' | 'synced' | 'failed';
}
```

UUID is generated once and remains stable across edits/retries. Date is a valid
`YYYY-MM-DD`; title is required, at most 150 characters; location required, at most
200; participant count is a positive safe integer; notes at most 5,000. There are
at most three local image attachments, each at most 1 MiB, associated by
`activity_id`; their Blob/name/id fields need an explicit upload/storage contract.
Compression normally produces JPEG; local validation accepts JPEG/PNG/WebP.

Backend must authenticate, derive actor from JWT, authorize current club membership,
validate all fields and enforce UUID ownership. Retrying the same activity must not
duplicate it, attachments or readiness events. Define edits, version conflicts,
deletions/tombstones, attachment finalization, acknowledgment and retryable errors
before enabling sync. Current frontend permits edits/deletes only before synced or
uploading; it lists only the signed-in user's club records on this device.
Define whether future server lists show all club activities and update labels/tests.
Choose role permissions explicitly; do not infer them from local edit controls.

`syncActivities()` currently throws; both `supabase/functions/sync-activity` and
`process-readiness` return HTTP 501. They must not be deployed as working services.
The historical API proposal uses `clubId`/`occurredAt` and an outbox that no longer
matches Dexie v2. It requires replacement or an explicit adapter, not blind adoption.
Never upload legacy records with missing creator identity without reconciliation.

## Phase 7 readiness backend design checklist

Original requested scope is in [phase7-spec.md](phase7-spec.md). The following is
pending backend work, not an implemented API.

1. Add a new additive migration after catalogue migrations. Create `processing_jobs`
   with UUID, club FK, job_type, JSON payload, constrained status
   (`queued|running|done|failed`), attempts/max_attempts, last_error, run_after,
   locked_at, created_at and finished_at. Add positive retry bounds and due-job
   indexes; partial uniqueness permits one queued job per club/job_type.
2. Create `readiness_results`: UUID, club/opportunity/requirement FKs, status
   (`supplied|not_supplied|expiring|expired`), evaluated_at, requirements_version;
   unique club/requirement. Enforce that the requirement belongs to the opportunity.
   Link table has result_id plus exactly one of evidence_id/activity_id per row,
   uniqueness to prevent duplicate supports, and a real FK to the future activity
   table. Enforce same-club links, including under privileged worker execution.
3. Add explicit activity-type and club-field mappings to requirements. Current schema
   has document_type/min_count but no activity matcher or required club-field list.
   Do not parse descriptions or invent programme requirements. Define allowlisted
   nonblank club fields, null min_count semantics, unsupported `other` handling and
   source/version requirements with the frontend/product owner.
4. Reconcile Phase 6 `required`, `condition`, source verification and current/version
   metadata. The four Phase 7 statuses cannot represent unknown/inapplicable by
   themselves. Define an additional reason/applicability contract and denominator
   before claiming conditional requirements are supplied or missing. Page-local
   self-reported facts are unavailable to server evaluation; do not silently persist
   them or use profile age as legal registration history.
5. Enqueue transactionally after evidence insert/delete, activity insert and
   requirement changes; extend to relevant evidence/activity updates/deletes and
   club profile changes so results cannot silently become stale. Requirement
   changes must reach all affected clubs, including clubs with no prior results.
   Bootstrap existing clubs, and enqueue newly created clubs. Coalesce bursts.
6. Implement privileged `process_next_job()` with qualified names, fixed search_path,
   restricted execution and `FOR UPDATE SKIP LOCKED`. Evaluate current requirements,
   replace supporting links and upsert results atomically; remove obsolete results
   or clearly exclude them from current reads. Use a consistent source snapshot or
   version/generation checks so old evaluations cannot overwrite newer ones.
7. Preserve work on failures: catch evaluation exceptions inside a rollback scope,
   persist attempts/error/backoff outside it, fail permanently only at max_attempts.
   Decide transaction/lease model explicitly. Recover abandoned running jobs if
   claims commit before evaluation; a single transaction instead releases its claim
   on rollback. Test crashes, not only caught exceptions.
8. Prevent lost events while a job is running: permit a queued successor or use a
   dirty generation, and serialize evaluation for the same club/job_type. The partial
   queued index alone does not stop two running evaluations for one club. Specify
   retry-versus-successor conflicts so uniqueness cannot discard either work item.
9. Document presence means at least min_count nonexpired rows of the mapped type;
   activity presence means min_count matching persisted activities; club info means
   the mapped fields are filled. Define expiry date boundary/timezone and an
   expiring horizon, plus precedence for mixed valid/expiring/expired rows and
   partial counts. Link the exact support records and explain shortages. None of
   these statuses establishes authenticity, compliance or funding entitlement.
10. Schedule expiry reevaluation even without new writes. A minute-by-minute worker
    alone cannot notice expiry unless jobs are enqueued. Include due expiry sweeps,
    bounded catalogue fan-out and a documented freshness target. Configure pg_cron
    only if available; otherwise use a trusted scheduler invoking the restricted
    database worker. Record cap N, timeout, schedule/timezone, owner, monitoring and
    retry/dead-job recovery procedure. Do not expose worker credentials to browsers.
11. Enable RLS on results and links: members read their club only, including joined
    support records. Clients cannot write results/links/jobs or execute workers.
    Revoke default PUBLIC/anon execution and unintended authenticated access.
    Optional admin Recompute must verify live admin membership and only enqueue;
    bound repeated requests. Define its name, args, acknowledgment and error shape.
12. Agree frontend read contract: results for selected club/opportunity with current
    version, assessed timestamp, reason/applicability and support IDs; fetch protected
    evidence/activity details with the same authorization. Define queued/running,
    stale, never-assessed and failed states separately from `not_supplied`. Choose
    polling or authorized Realtime subscriptions and cleanup on scope changes.

UI vocabulary is Supplied, Not supplied, Expiring and Expired, with last assessed
time and an “X of Y requirements supplied” summary. This is a presence summary,
not a score, approval or eligibility decision. Phase 6 rule assessment remains a
separate feature; do not relabel its outputs as worker results.

## Deployment order and ownership

1. Review/commit the existing Phase 6 working files with the owner. They were not
   part of the `frontend-dev` HEAD when this handoff branch was created.
2. Verify the intended Supabase project and migration history. Repository order:
   `202611070001_phase3.sql`, `202611070002_document_storage.sql`,
   `202611070003_club_membership.sql`, `202611080002_opportunities.sql`,
   `202611080003_opportunity_assessments.sql`. There is no Phase 5 activity migration.
3. Apply those migrations on a disposable full Supabase instance, then the curated
   `supabase/seeds/opportunities.sql`; verify repeat seed safety and archive/history.
   Five programmes are listed; a sixth legacy record is archived. No current open
   offer is asserted. Source review limitations live in `opportunity-sources.md`.
4. Agree activity/schema and readiness contracts above, then implement new additive
   migrations, real sync/storage integration, workers, scheduler and observability.
   No privileged secrets or sensitive payloads in job errors/logs; define retention
   for jobs, results, attachments and account/club deletion.
5. Have frontend integrate only after database/API review. Exercise rollback and
   worker-disable procedures on staging before production rollout. Preserve source
   evidence on failure; derived results can be rebuilt. No hosted changes occurred
   as part of this documentation task.

## Required validation and acceptance

Existing SQL suites: `phase3_security.sql`, `document_storage.sql`,
`club_membership.sql`, `opportunities.sql`, `opportunity_assessments.sql` under
`supabase/tests/`. Prior passes used a minimal PostgreSQL Auth/Storage contract;
they do not prove real Supabase Auth, Storage, PostgREST or hosted configuration.
Frontend tests mock service boundaries. Team must run full-runtime integration.

- Two clubs, admins/members/outsiders and anon: test every table, RPC, file read,
  signed URL, role change, removal, forged identity and cross-club relation.
- Signup/confirmation/recovery/session expiry; atomic club setup; concurrent invite
  redemption, expired/revoked invites and last-admin protections.
- Document upload/delete partial failures, size/MIME/path denial and cleanup retry.
- Activity acknowledgment after durable write; repeated UUID uploads; changed-owner
  rejection; network interruption, attachments, conflicts and revoked membership.
- Readiness burst deduplication; caught failures retry then permanently fail;
  rollback/crash recovery; real two-session worker claims and same-club concurrency;
  events arriving during evaluation/retry; requirement version replacement and seed
  reruns; bootstrap, club updates and scheduled expiry without user actions.
- Date boundaries, mixed expiry states, min_count, unmapped/conditional requirements,
  stale versus missing results, exact support links and no cross-club leakage.
- Clients cannot write jobs/results/links or call workers; Recompute denied to
  members/outsiders and permitted for current admins only.
- End-to-end acceptance after sync exists: add tournament in PlayProof, sync once,
  observe matching current requirement change automatically within agreed freshness
  target, without manual checklist updates; duplicate retries do not inflate counts.
- Frontend readiness statuses, support links, last assessed time, summary denominator,
  Recompute permissions, pending/errors, stale responses, offline behavior and mobile
  keyboard use. Run `npm test`, `npm run lint`, `npm run build` after code integration.

Backend team owns schema/RLS, persistence, sync authorization, scheduler, worker and
deployment. Frontend team owns service adapters, refresh/subscriptions, user states
and presentation. Both teams must agree unresolved contracts before implementation.
