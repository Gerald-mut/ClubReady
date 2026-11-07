// sync-activity: idempotent upload of one offline-created activity.
// The user's JWT is forwarded to Postgres, so RLS and the sync_activity()
// membership check apply. Club ownership is never trusted from the client.
import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ACTIVITY_TYPES = ['training', 'match', 'tournament', 'community_event', 'other']

type Json = Record<string, unknown>

function json(status: number, body: Json) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function fail(status: number, code: string, message: string, details?: unknown) {
  return json(status, { error: { code, message, ...(details ? { details } : {}) } })
}

function log(entry: Json) {
  console.log(JSON.stringify({ fn: 'sync-activity', ...entry }))
}

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v))
}

function optionalCount(v: unknown, name: string, errors: string[]): number | null {
  if (v === undefined || v === null) return null
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
    errors.push(`${name} must be a non-negative integer`)
    return null
  }
  return v
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return fail(405, 'method_not_allowed', 'Use POST')

  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return fail(401, 'unauthenticated', 'Missing bearer token')
  }

  let payload: Json
  try {
    payload = await req.json()
  } catch {
    return fail(400, 'invalid_input', 'Body must be valid JSON')
  }

  const a = (payload?.activity ?? null) as Json | null
  if (!a || typeof a !== 'object') {
    return fail(400, 'invalid_input', 'Body must contain an "activity" object')
  }

  // ---- validation -----------------------------------------------------
  const errors: string[] = []
  if (typeof a.id !== 'string' || !UUID_RE.test(a.id)) errors.push('id must be a UUID')
  if (typeof a.clubId !== 'string' || !UUID_RE.test(a.clubId)) errors.push('clubId must be a UUID')
  const title = typeof a.title === 'string' ? a.title.trim() : ''
  if (title.length < 1 || title.length > 200) errors.push('title must be 1 to 200 characters')
  if (!isIso(a.occurredAt)) errors.push('occurredAt must be an ISO-8601 timestamp')
  if (!isIso(a.createdAt)) errors.push('createdAt must be an ISO-8601 timestamp')

  const activityType = a.activityType ?? 'training'
  if (typeof activityType !== 'string' || !ACTIVITY_TYPES.includes(activityType)) {
    errors.push(`activityType must be one of: ${ACTIVITY_TYPES.join(', ')}`)
  }

  const total = optionalCount(a.participantsTotal, 'participantsTotal', errors)
  const under18 = optionalCount(a.participantsUnder18, 'participantsUnder18', errors)
  const girls = optionalCount(a.participantsGirls, 'participantsGirls', errors)
  if (total !== null && under18 !== null && under18 > total) {
    errors.push('participantsUnder18 cannot exceed participantsTotal')
  }
  if (total !== null && girls !== null && girls > total) {
    errors.push('participantsGirls cannot exceed participantsTotal')
  }

  if (errors.length > 0) {
    log({ outcome: 'invalid_input', errors })
    return fail(400, 'invalid_input', 'Validation failed', errors)
  }

  // ---- authenticate ---------------------------------------------------
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData?.user) {
    log({ outcome: 'unauthenticated' })
    return fail(401, 'unauthenticated', 'Invalid or expired token')
  }

  // ---- idempotent write + outbox job (one transaction in Postgres) ----
  const { data, error } = await supabase.rpc('sync_activity', {
    p_club_id: a.clubId,
    p_client_id: a.id,
    p_title: title,
    p_activity_type: activityType,
    p_occurred_at: a.occurredAt,
    p_client_created_at: a.createdAt,
    p_participants_total: total,
    p_participants_under_18: under18,
    p_participants_girls: girls,
  })

  if (error) {
    const base = { userId: userData.user.id, clubId: a.clubId, activityId: a.id, pgCode: error.code }
    if (error.code === '42501') {
      log({ ...base, outcome: 'forbidden' })
      return fail(403, 'forbidden', 'You are not a member of this club')
    }
    if (error.code === '23514' || error.code === '22P02' || error.code === '22007') {
      log({ ...base, outcome: 'invalid_input', message: error.message })
      return fail(400, 'invalid_input', 'Activity data was rejected by the database')
    }
    log({ ...base, outcome: 'error', message: error.message })
    return fail(500, 'internal_error', 'Could not save the activity. Safe to retry.')
  }

  log({ userId: userData.user.id, clubId: a.clubId, activityId: a.id, outcome: 'ok' })
  return json(200, { activityId: data })
})
