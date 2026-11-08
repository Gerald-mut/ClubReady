# Phase A review

## Review decision

Owner review approved on 2026-11-08, with authorization to proceed beyond the
Phase A review stop. The reviewed implementation is committed as `42ca36a`
(`harden activity storage and sync`). Orphan deletion remains disabled pending
the explicit abandonment protocol described below. Physical Storage behavior
remains unverified. This approval does not authorize hosted operations, push,
merge or deployment.

## Orphan Storage cleanup blocker

Automatic deletion is intentionally disabled. `src/services/sync/engine.ts`
uploads deterministic object paths before inserting the activity and attachment.
A crash at either boundary leaves an object without metadata. Failed activities
retain local blobs and frozen UUIDs and may retry indefinitely, including after
reauthentication or a long offline absence. There is no server upload-intent row,
lease, retry deadline, cancellation acknowledgment, or terminal abandonment state.
Storage `owner_id` establishes the uploader; `created_at` establishes age. Neither
establishes abandonment. Missing activity/attachment rows, membership revocation,
and old timestamps cannot safely authorize deletion. A bounded scan does not fix
this ambiguity. No Storage DELETE policy, privileged delete RPC, SQL catalog
cleanup, scheduler, or browser cleanup has been added.

A future implementation needs an explicit upload-intent protocol adopted by all
writers: server-derived owner and club, reserved deterministic paths, renewable
lease/retry deadline, and a terminal cancellation/expiry contract that forbids
subsequent finalization. Claims/finalization and cleanup must serialize against
each other. A trusted worker must select a capped batch (for example 100), recheck
ownership, terminal state and absence of committed attachment references, and use
the Storage API to delete physical bytes with idempotent retries and an audit
record. Legacy objects without intent records must remain excluded until explicit
owner reconciliation. This is a design prerequisite, not an implemented protocol.

## Attachment and upgrade behavior

The existing Phase A migration is left unchanged. It enforces one MiB for new
attachment metadata and the bucket, checks finalized Storage numeric size and
MIME against attachment metadata, and serializes a three-attachment quota.
Client attachments remain immutable. It checks catalog metadata, not file bytes.
Historical oversized rows are preserved by a NOT VALID constraint; they require
an explicit reconciliation before validation. Missing/inconsistent objects are
reported but preserved. More than three existing attachments aborts the migration
atomically. No historical row is silently deleted or rewritten.

Regression coverage includes upload interruption before activity persistence,
metadata retry during backoff, retry after a year offline, old object preservation,
client deletion denial, metadata bounds, duplicate retries and competing inserts.
The local upgrade regression reconstructs the predecessor contract inside a
rollback-only transaction, verifies over-cap atomic rejection, then applies the
actual migration text and checks historical row preservation and quota backfill.
SQL fixtures contain catalog rows only; they do not prove physical Storage API
behavior or hosted configuration. No hosted operation is part of this review.

## Validation results

Validated locally on 2026-11-08: all seven root SQL suites, 10 pgTAP
assertions, the historical upgrade regression, and three overlapping-session
concurrency cases passed. `npm test` passed 137 tests across 14 files; lint,
typecheck and build passed. Build retains the bundle-size warning (>500 kB).
Detailed output is in `.codex-logs/phase-a-review-*.log`, with individual
concurrency sessions in `.codex-logs/phase-a-concurrency-*.log`.

The first preservation assertion incorrectly expected a DELETE permission error;
RLS instead hides the row. The corrected test verifies that the object survives.
The aggregate SQL runner completed all seven suites but its pgTAP invocation
initially used the repository project name; standalone pgTAP was rerun with the
isolated stack workdir and passed. The committed CI runner uses its own configured
local stack and includes the new upgrade regression before concurrency fixtures.

Existing README, activity_sync SQL, CI files, Phase A migration/tests, database
schema tests and Codex documentation work were preserved. No applied migration,
readiness UI or sync production code was changed. The Phase A review stop is now
approved; orphan deletion remains blocked by the missing abandonment protocol.
