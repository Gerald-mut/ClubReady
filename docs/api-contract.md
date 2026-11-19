# Proposed API contract

> Historical scaffold proposal. For the current app contracts and pending backend
> integration, read [backend-handoff.md](backend-handoff.md). The activity payload
> below predates Dexie v2. Phase 5 now syncs directly through PostgREST and
> Storage using `src/services/sync/transport.ts`; this Edge Function proposal is
> not the active browser sync contract.
> Phase 7 workers must be privileged; a future user Recompute action is admin-only,
> superseding the generic membership-only proposal below.

Both Edge Function stubs return HTTP 501 with `{ "error": "Not implemented" }`.
The following contract is planned, not deployed.

## POST /functions/v1/sync-activity

Require a Supabase user JWT. Body: `{ "activity": { "id": "uuid", "clubId": "uuid",
"title": "Training", "occurredAt": "ISO-8601 timestamp", "createdAt": "ISO-8601 timestamp" } }`.
Success: HTTP 200 with `{ "activityId": "uuid" }` matching the submitted ID.
The client removes the outbox entry only after that acknowledgement.

The server must validate input, verify club membership and perform idempotent writes
by activity ID so interrupted requests can be safely retried. Planned errors: 400 for
invalid input, 401 for missing authentication, 403 for insufficient authorization.
Failed entries remain queued. Never trust club ownership supplied by the client.

## POST /functions/v1/process-readiness

Proposed body: `{ "clubId": "uuid" }`. Require authenticated club membership.
Readiness criteria and response fields remain to be defined. No scores are computed.
