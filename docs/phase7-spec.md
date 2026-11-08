# Phase 7: Event-driven readiness engine

Goal: adding an activity or document automatically changes a club's readiness assessment for relevant opportunities, with no manual checklist updates. Do not implement PDF export or sharing.

Database (new migration only):
- processing_jobs: id, club_id, job_type, payload jsonb, status (queued|running|done|failed), attempts int, max_attempts, last_error, run_after, locked_at, created_at, finished_at. Unique partial index so only one queued job per (club_id, job_type).
- readiness_results: id, club_id, opportunity_id, requirement_id, status (supplied|not_supplied|expiring|expired), evaluated_at, requirements_version. Unique (club_id, requirement_id).
- readiness_result_evidence: result_id, evidence_id nullable, activity_id nullable. Records exactly which items support each result.
- Triggers: after insert/delete on evidence, after insert on activities, and after changes to opportunity_requirements, enqueue a job (idempotent via the unique index).
- Function process_next_job(): claims one job with FOR UPDATE SKIP LOCKED, evaluates all current requirements for that club, upserts results and links, marks done. On error: increment attempts, store last_error, set run_after with backoff, and mark failed only after max_attempts. A job must never be lost.
- Evaluation rules: document requirement is met if the club has at least min_count evidence rows of that document_type that are not expired (expires_at). Activity requirement is met if the club has at least min_count matching activities. club_info is met if the fields are filled.
- Trigger to run jobs: pg_cron every minute calling process_next_job() in a loop (cap N per run). Document manual setup if pg_cron is not enabled.
- RLS: club members SELECT their own club's results only. Clients cannot write jobs or results. Functions use SET search_path, REVOKE from public/anon, and are not callable by clients except an optional admin-only "recompute now" RPC.
- Vocabulary: "supplied", "not supplied", "expiring". Never "verified", "eligible" or "approved".

UI:
- On the opportunity detail page, show each requirement's status and the evidence or activities that support it, with a "last assessed" time.
- A readiness summary per opportunity (e.g. "4 of 6 requirements supplied"). Not a score or a guarantee.
- An admin-only "Recompute" button. Loading, empty and error states.

Tests:
- SQL: an insert enqueues exactly one job even when many events arrive; a failing job retries and then fails permanently; two workers never claim the same job; cross-club isolation; expired evidence flips the status; clients cannot write results.
- Frontend: statuses render per requirement, and the Recompute permissions.
- Acceptance: adding a tournament activity changes the matching requirement's status without a manual update.