# ClubReady API contract

Status: `sync-activity` and the club RPCs are implemented. `process-readiness` is not.
All calls need a signed-in user (Supabase Auth session). Never use the service_role key in the frontend.

## Error shape (Edge Functions)

Every failure returns:

```json
{ "error": { "code": "invalid_input", "message": "Validation failed", "details": ["title must be 1 to 200 characters"] } }
```

| HTTP | code | Meaning | Client action |
|------|------|---------|---------------|
| 400 | `invalid_input` | Bad or rejected data | Do not retry; fix the data |
| 401 | `unauthenticated` | Missing or expired token | Refresh the session, then retry |
| 403 | `forbidden` | Not a member of that club | Do not retry |
| 405 | `method_not_allowed` | Wrong HTTP method | Use POST |
| 500 | `internal_error` | Server problem | Keep in the outbox and retry later |

Network failures and 5xx: keep the entry queued. 4xx other than 401: surface to the user, do not retry blindly.

## POST /functions/v1/sync-activity

Body:

```json
{
  "activity": {
    "id": "uuid generated on the device",
    "clubId": "uuid",
    "title": "Training",
    "occurredAt": "2026-11-07T15:00:00Z",
    "createdAt": "2026-11-07T15:05:00Z",
    "activityType": "training",
    "participantsTotal": 20,
    "participantsUnder18": 15,
    "participantsGirls": 8
  }
}
```

Required: `id`, `clubId`, `title` (1-200 chars), `occurredAt`, `createdAt` (ISO-8601).
Optional: `activityType` (`training` | `match` | `tournament` | `community_event` | `other`, default `training`),
`participantsTotal`, `participantsUnder18`, `participantsGirls` (non-negative integers; under-18 and girls cannot exceed total).
Participant counts are needed for the readiness rules (majority under 18, share of girls).

Success: `200 { "activityId": "<same id you sent>" }`. Remove the outbox entry only after this response.

Idempotent: the server stores `(clubId, id)` once. Sending the same activity again returns the same 200 and creates no duplicate, so retrying after a dropped connection is always safe.

JS example:

```js
const { data, error } = await supabase.functions.invoke('sync-activity', { body: { activity } })
```

## Clubs (Postgres RPC via supabase-js)

```js
// Create a club; caller becomes club_admin. Returns the club id.
const { data: clubId } = await supabase.rpc('create_club', { p_name: 'Nairobi Youth FC' })

// Join with the club's join code. Returns the club id.
const { data: clubId } = await supabase.rpc('join_club', { p_join_code: 'a1b2c3d4' })
```

Errors: `invalid_join_code` (code `P0002`), `not_authenticated` (code `28000`).
Members can read `clubs.join_code` for their own club and share it to invite others.

## Reading data (direct table reads, protected by RLS)

You only ever see rows for clubs you belong to.

| Table | Read | Notes |
|-------|------|-------|
| `clubs`, `club_members` | members | Roster and club details |
| `activities` | members | Read-only. Create through `sync-activity` |
| `opportunities`, `requirements` | any signed-in user | Seeded by SQL |
| `club_credentials` | members | Members may insert rows with status `uploaded` |
| `readiness_results` | members | Written by the engine only |

## Readiness statuses (honest statuses)

`evidence_available` (backed by structured activity data), `needs_review` (document uploaded or manual check, never "eligible"), `not_met`, `not_evaluated`.

## POST /functions/v1/process-readiness (planned)

Not implemented yet. Body will be `{ "clubId": "uuid" }`. For now, read `readiness_results` once the engine ships.
