# Architecture

React Router preserves the four feature routes and adds public authentication pages
and authenticated club onboarding. AuthProvider restores Supabase sessions and tracks
password recovery independently of normal redirects. ClubProvider loads the earliest
membership and corresponding club, with state keyed by authenticated account so another
user cannot inherit a previous account's club display. Background profile refresh keeps
the current selection visible; initial and failed membership loads have explicit states.

Supabase PostgreSQL is authoritative for Phase 3. Atomic create_club creates a club and
its first admin; clients never choose their membership role. RLS enforces membership
reads and administrator profile/document writes. Evidence metadata is immutable and can
be replaced by delete/upload. Storage uses a private club-evidence bucket and separate
club-scoped policies; signed URLs last one minute. Upload and metadata writes are separate
operations with compensating cleanup, not a distributed transaction.

The private schema contains narrowly scoped membership helpers with fixed empty search
paths to avoid recursive RLS. It must not be exposed through the Data API. Future evidence
relations can reference evidence.id; no activity or opportunity relations exist yet.

Tailwind styling retains the green/slate design and mobile-first layouts. The existing
PWA caches only the application shell; private API responses are not cached. Phase 3
requires an online Supabase connection. Dexie v1 stores and activity/outbox helpers remain
unchanged, disconnected from the Phase 3 UI. Offline synchronization, readiness and
package generation remain future phases; existing Edge Functions still return 501.
