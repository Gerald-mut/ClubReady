# Readiness database foundation

Phase B adds `202611080005_readiness_schema.sql`. Existing migrations, seeds,
frontend and API contracts are unchanged. There is no worker, enqueue trigger,
RPC, scheduler or automatic assessment. No hosted operations are needed.

## Tables and relationships

- `readiness_requirement_mappings`: one explicit typed mapping per requirement.
  A composite foreign key retains the requirement ID, opportunity and version.
- `processing_jobs`: UUID, club, readiness job type, object payload, status,
  attempts/max_attempts, last_error, run_after, generation/claimed_generation,
  locked_at and created/updated/finished timestamps.
- `readiness_results`: one snapshot per club/requirement, linked to the exact
  mapping and requirement version, with opportunity, evidence status,
  applicability, reason, evaluated_at, processing_state and generation.
- `readiness_result_evidence`: exactly one evidence ID or activity ID per link.
  Composite foreign keys bind both result and support to the same club. Unique
  constraints prevent repeated support IDs per result, even for trusted writes.

Supporting-record deletion cascades its links, preserving the existing evidence
DELETE contract. Result deletion cascades links. Requirement deletion cascades
mappings/results/links. Composite keys prevent referenced IDs, clubs, opportunities
or versions from being changed underneath dependent rows. Version replacement
requires a new requirement ID or explicitly retiring dependent snapshots and
mappings first; this phase does not invent historical requirement records.

## Mapping contract

Mappings never parse descriptions. `document` names an existing document_type
and positive min_count; `activity` names one allowlisted PlayProof activity_type
and positive min_count. Both counts must equal the structured requirement count.
`club_info` lists nonempty, non-null profile field names from name, county,
sub_county, year_established, description and contact_email. All listed fields
will be required; blank strings must count as missing in Phase C. A year is only
profile information, not legal registration history. `unsupported` has no matcher.
Typed columns are mutually exclusive and must match requirement_type.

At migration time, only existing document requirements with explicit positive
counts are mapped automatically. All others receive `unsupported`; no default
count or activity/profile mapping is invented. New requirements, including seeds
loaded after a clean reset, need trusted explicit mapping curation before results
can reference them. Seed replay does not overwrite mappings. Mapping rows refer
to original requirements; source_note, source_reference, verification, required,
condition, is_current, description and version remain on those original rows.
No source or conditional metadata is rewritten.

## Status and applicability

Evidence states: supplied, not_supplied, expiring, expired, unknown,
not_applicable. Applicability: applicable, not_applicable, unknown. Unknown
applicability permits only unknown status; not_applicable must agree in both
columns. Non-unknown statuses require evaluated_at. Reasons are mandatory,
nonblank explanations/codes. The default is unknown/unknown/not_evaluated with
no evaluated_at. No result rows are fabricated by the migration.

Unsupported mappings, unresolved conditions (any non-null condition), and source
verification other than verified require unknown status/applicability on result
writes. A verified source describes requirement curation, never document
verification. Uploaded evidence cannot establish authenticity, approval,
compliance or funding eligibility. Optional requirements remain optional; required
is not used to invent applicability or a denominator.

Processing state is a separate column: never_assessed, queued, running, current,
stale, failed. It never substitutes for an evidence status. Current requires an
evaluation timestamp. Phase B checks structure, not evaluation truth or freshness.

## RLS and privileges

RLS is enabled on all four tables. Authenticated users may read mappings and may
read results/links only through live `private.is_member(club_id)` checks. Revoked
membership removes access immediately. Anonymous users have no access. Queue
rows have no browser read or write grants or policies. No browser mutation grants
exist for mappings, results or links, including for club admins.

PUBLIC, anon, authenticated and service_role have their default grants explicitly
revoked before the narrow SELECT grants are applied. Phase B grants no worker
writes to service_role; BYPASSRLS alone does not confer table privileges. Only the
database owner or an independently authorized privileged operator can curate or
write fixtures. Trigger functions use an empty search_path, qualified table names,
security invoker and revoked direct execution. No public privileged RPC is added.
Foreign keys enforce club and opportunity integrity independently of RLS.

## Queue contract

Partial unique indexes permit at most one queued and one running job for each
club/job type. A running job may have a queued successor. Due queued jobs are
indexed by run_after/created_at. Attempts are bounded by max_attempts (1..100);
exhausted jobs cannot remain queued. Running requires a lock timestamp and claimed
generation; terminal statuses require finished_at. Claimed generation cannot
exceed requested generation. Payload must be a JSON object.

Generations are positive per-row counters, not an implemented global clock.
Timestamps are structural fields; no trigger advances them. Phase C must update
these fields atomically. Unique indexes are concurrency-safe, but do not implement
claiming, event coalescing, retry merging or crash recovery.

## Decisions before Phase C

- Define authorized worker role, claim transaction/lease, lock order, bounded
  retries, dead-job recovery and retry/successor conflict handling.
- Define authoritative club generations and source snapshot/version checks.
  Requirement/mapping/profile/support edits and deletions must invalidate results;
  Phase B does not automatically mark snapshots stale or recompute counts.
- Curate sourced activity/profile mappings and null-count document requirements.
  Define condition evaluation and unknown/inapplicable denominator semantics.
- Define expiry timezone/boundary, expiring horizon, mixed-support precedence,
  support selection and count-shortage explanations.
- Define bounded event fan-out, bootstrap/new-club enqueue and expiry reevaluation.
- Define trusted recompute authorization and frontend read/freshness contract.

## Validation and limitations

`supabase/tests/readiness_schema.sql` uses rollback-only fixtures and actual role
switches. It covers composite relationships, both support types, duplicates,
version drift, typed mappings, all evidence states, unknown guards, queue bounds,
member/admin isolation, revoked membership and browser/anonymous/service grants.
Run it with psql ON_ERROR_STOP after migrations and seeds, alongside every existing
SQL suite and pgTAP. Detailed Phase B command output is in `.codex-logs/phase-b-*.log`.

`scripts/ci/test-readiness-upgrade.py` applies the actual migration body over
populated predecessor tables in a rollback-only transaction. It compares all
existing rows, including source/version/condition metadata, and checks typed
backfill without inferred counts or mappings. The backend CI runner includes it.

Local validation on 2026-11-08 passed startup, clean migration reset, repeated
seed execution, all eight SQL suites, 10 pgTAP assertions, both populated upgrade
regressions, three existing activity concurrency cases and `git diff --check`.

Physical Storage bytes, hosted Auth/Storage configuration and worker behavior are
outside this phase. Links prove record ownership and existence, not file existence
or authenticity. Supporting records are not yet checked against mapping types by
an evaluator; Phase C must select exact matching supports. Existing Phase A orphan
cleanup remains disabled.
