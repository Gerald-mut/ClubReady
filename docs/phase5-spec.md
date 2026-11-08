# Phase 5: PlayProof cloud sync

Goal: an offline activity appears in the cloud exactly once after reconnection, even if the upload is retried. Do not implement opportunities, readiness, or export.

Database (new migration only):
- activities: id UUID PK (the client-generated UUID, never regenerated), club_id, created_by, activity_type, title, date, location, participants_count, notes, created_at (client time), synced_at (server default now()). CHECK constraints mirroring client validation.
- activity_attachments: id UUID PK (client-generated), activity_id FK, storage_path, mime_type, file_size.
- RLS: members of the club can SELECT; INSERT only if user is a member of club_id AND created_by = auth.uid(). No client UPDATE/DELETE for now. Cross-club access denied. Avoid recursive policies.
- Private storage bucket activity-media, club-scoped deterministic paths: {club_id}/{activity_id}/{attachment_id}.jpg. Policies: members of the club only; JPEG/PNG, 5 MB max.
- Leave groundwork (no implementation) for linking evidence to activities later.

Client sync engine (src/services/sync/):
- Idempotent insert: upsert with ignoreDuplicates (ON CONFLICT DO NOTHING). Retrying must never create duplicates.
- Order: upload attachments first (treat "already exists" as success), then insert the activity row, then re-read the row to confirm before marking synced. Status flow: pending_sync -> uploading -> synced, or failed.
- Failed: keep the local record, store last_error and attempt count, retry with exponential backoff.
- Triggers: manual "Sync now" button, the window "online" event, and an interval while the app is open and online. Prevent concurrent runs (single-flight lock). No Background Sync API (poor iOS support).
- Handle auth expiry mid-sync: pause and prompt re-login; never lose local data.
- Synced entries stay readable offline. Never delete local data until the server confirms.
- UI: status badge per entry (Saved locally, Pending sync, Uploading, Synced, Failed - retry), global sync indicator, error messages in plain language.

Tests:
- SQL: member inserts for own club OK; unrelated user denied; created_by spoofing denied; duplicate insert is a no-op; storage policy denies cross-club.
- Frontend: retry after failure creates one row; offline -> online transition syncs; partial failure (attachment ok, row fails) resumes cleanly; concurrent triggers run once.
