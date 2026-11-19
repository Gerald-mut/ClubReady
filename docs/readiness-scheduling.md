# Phase D: readiness scheduling

This phase adds a deployable external scheduler and aggregate health endpoint.
It does not activate hosting or alter mappings, applicability, null-expiry rules,
or the frontend. Run the timer on a trusted Linux host with Python 3 and psql.
No Python packages, Supabase service key, browser RPC or pg_cron extension needed.

## Execution and capacity

Each minute, the timer starts a single oneshot service. A tick makes at most 40
worker calls within 45 seconds, then reports aggregate health if time remains.
Each call uses a fresh psql connection with autocommit: claim, evaluation and
completion commit independently. Never wrap a batch in a transaction. Empty
returns do not stop preparation. Each call prepares up to 100 club states and
processes at most one job. UUID returns include retries/failures, not just success.
A fresh connection retries infrastructure errors within both caps; database job
errors retain Phase C backoff and the five-attempt ceiling. Statement, lock,
idle-transaction and connect timeouts are 10, 2, 5 and 5 seconds respectively;
subprocess deadlines and the 55-second service timeout bound the whole tick.
Cancellation/disconnection rolls back a job; it is eligible on a later tick.
A timeout before commit acknowledgement can leave a completed job: rerun the
entrypoint, never replay a captured job ID. Existing generation locking applies.

Healthy unloaded processing normally starts within one minute, but this is an
operational target, not a freshness guarantee. At most 40 evaluations per minute
per instance means a backlog of C clubs needs at least ceil(C/40) ticks, plus
runtime, retries and contention. Catalogue preparation can run ahead of evaluation.
UTC daily sweeps share this queue, including catch-up after downtime. Increasing
parallel instances requires measuring database load; SKIP LOCKED keeps claims safe.
The frontend must not equate stored processing_state=current with global catalogue
freshness. No frontend freshness contract is introduced in this phase.

## Provision and activate on the chosen infrastructure

1. Apply migrations through 007 using the separately reviewed database release
   process. On the database, provision a dedicated LOGIN, NOSUPERUSER, NOCREATEDB,
   NOCREATEROLE, NOREPLICATION, NOBYPASSRLS role named clubready_scheduler. Grant
   readiness_worker and CONNECT on the target database. Ensure USAGE on public.
   Provision the password through your secret manager, outside logs/source control.
   Do not grant table access, private schema access, service_role or admin roles.
2. Install this checkout read-only at /opt/clubready. Create the unprivileged OS
   user/group clubready-readiness. Copy ops/readiness/service.conf.example to
   /etc/clubready/readiness-service.conf and set the actual database host, database,
   dedicated login and trusted TLS CA (sslmode=verify-full). Install its password
   in /etc/clubready/readiness.pgpass, owned by that OS user, mode 0600. The libpq
   entry format is hostname:port:database:username:password; escape colons and
   backslashes in credentials. Never use a transaction-pooling endpoint unless
   its behavior and role support have been validated; prefer a direct connection.
3. As that OS user, with PGSERVICE, PGSERVICEFILE and PGPASSFILE matching the
   service, run `python3 /opt/clubready/scripts/readiness/run.py --max-calls 2`.
   Confirm health JSON and inspect queue state through trusted operator access.
4. Install both ops/readiness unit files under /etc/systemd/system, run
   `systemctl daemon-reload`, then `systemctl enable --now clubready-readiness.timer`.
   Check `systemctl list-timers clubready-readiness.timer` and
   `journalctl -u clubready-readiness.service`. Persistent=true catches up a missed
   tick after downtime; recurring sweeps catch up the queue, not every missed tick.
   systemd does not start a second copy while this oneshot service is active.
5. Stop activation with `systemctl disable --now clubready-readiness.timer`.
   Let an active invocation finish, or stop the service to cancel it. No queue
   deletion or reversal of source events is necessary. Revoke role membership
   and rotate/delete the dedicated login credential when decommissioning.

If systemd is unavailable, a trusted scheduler can run the same command every
minute with equivalent secret injection, non-overlap, timeout and alert controls.
Do not substitute a SQL loop calling process_next_job in one pg_cron transaction:
that holds all locks until the loop ends and violates the worker commit contract.
The external runner is the documented fallback to Phase 7's pg_cron suggestion.

## Monitoring and retention

readiness_health() is executable only by readiness_worker and the database owner.
It returns counts, oldest due age and last successful completion time, never club
IDs, support data or stored error text. Each tick emits one JSON record. Nonzero
exit means infrastructure errors, unavailable health or retained failed jobs.
A returned job UUID is counted but never logged. Health scans are exact aggregates;
measure their cost at production scale before increasing cadence.

Configure host monitoring before activation: alert on any failed jobs; no tick
logs for three minutes; nonzero service exits; oldest_due_seconds > 300 for five
minutes; catalogue_pending remaining nonzero for five minutes; and sweep_pending
remaining nonzero 15 minutes after UTC midnight. Capacity-dependent thresholds
must be adjusted to the measured club/requirement load. An empty installation
can legitimately have last_completed_at=null. Timer logs establish liveness even
when there are no jobs. Alerts are runbook requirements, not connected services
provisioned by this repository.

Inspect failures as a trusted operator, fix the cause, then invoke
private.enqueue_readiness(club_id) with trusted SQL to create a new generation.
Do not reset attempts or delete failed jobs before recording the incident.
Retain failed jobs until triaged. Proposed completed-job retention is 30 days;
perform bounded operator-approved deletes of done jobs with finished_at older
than that window after metrics capture. No automatic destructive retention task
is installed; source data, results and support links are never cleanup targets.

## Verification and rollout boundary

Run scripts/ci/test-backend.sh on the disposable local stack. Scheduling SQL tests
check health access restrictions; runner tests cover caps, NULL preparation,
retries, timeouts, health failures and log redaction. The real scheduler integration
test connects as a dedicated LOGIN with readiness_worker membership, processes
source-triggered work and denies table/private/client access.

Hosted activation still needs a selected host, database endpoint, credentials,
TLS trust, measured capacity and an alert destination. These are deployment
inputs, not values inferred from repository secrets. No timer is activated by
migrations or CI. The curation and evaluation decisions recorded in the Phase C
worker document remain unresolved product work; scheduling does not resolve them.

References: PostgreSQL libpq environment configuration:
https://www.postgresql.org/docs/17/libpq-envars.html
Systemd timer activation and persistence:
https://www.freedesktop.org/software/systemd/man/latest/systemd.timer.html
