# Architecture

React Router maps the four feature pages. Tailwind uses its Vite plugin.
Dexie provides versioned clubs, activities, opportunities and pendingActivities stores.
`saveActivity` atomically persists an activity and its sync outbox entry.

Supabase is optional for local browsing. `syncActivities` requires an authenticated
session and sends queued records sequentially, retaining each until its ID is
acknowledged. Sync is explicitly invoked; background sync and conflict resolution
are future work. Local data must be isolated by account before multi-account use.

The PWA precaches the application shell and prompts before applying updates.
It does not cache Supabase responses. Use HTTPS and SPA fallback routing in production.

Pages and backend functions are scaffolds. Authentication UI, schema migrations,
row-level security, storage policies and readiness scoring remain to be implemented.
