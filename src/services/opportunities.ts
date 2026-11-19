import { backend } from './supabase'
import type { Evidence } from '../types/club'
import type { EligibilityRule, Expression, SourceReference } from './opportunity-assessment'

export interface CatalogueOpportunity {
  id: string; title: string; organiser: string; description: string; source_url: string
  application_method: string; application_url: string | null; deadline: string | null
  status: 'open' | 'closed' | 'historical' | 'upcoming' | 'unconfirmed'; review_date: string; is_demonstration: boolean
  slug?: string; opportunity_type?: 'government_grant' | 'foundation_grant' | 'tournament' | 'fundraising_platform'
  geographic_scope?: string[]; target_applicants?: string[]; cycle?: string | null; opens_at?: string | null
  amount?: { currency: string; max: number | null; note: string } | null
  verification_status?: 'official_source_reviewed' | 'needs_reverification'; last_verified_at?: string | null; next_review_at?: string | null
  sources?: SourceReference[]; application_steps?: { order: number; text: string; source: SourceReference }[]; notes?: string[]; is_listed?: boolean
}
export interface Requirement {
  id: string; opportunity_id: string; version: number
  requirement_type: 'document' | 'activity' | 'club_info' | 'other'
  document_type: Evidence['document_type'] | null; description: string
  min_count: number | null; source_note: string; is_current: boolean
  required?: boolean; condition?: Expression | null; source_reference?: SourceReference | null; verification?: 'verified' | 'needs_verification'
}
export const trackingStatuses = {
  not_started: 'Not started', preparing: 'Preparing', submitted: 'Submitted', outcome_received: 'Outcome received',
} as const
export type TrackingStatus = keyof typeof trackingStatuses
export interface Tracking {
  id: string; club_id: string; opportunity_id: string; status: TrackingStatus
  notes: string | null; updated_at: string; updated_by: string | null
}
export async function listOpportunities() {
  const { data, error } = await backend().from('opportunities').select('*').eq('is_listed', true).order('title')
  if (error) throw error
  return data as CatalogueOpportunity[]
}
export async function getOpportunity(id: string) {
  const { data, error } = await backend().from('opportunities').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return data as CatalogueOpportunity | null
}
export async function listRequirements(id: string) {
  const { data, error } = await backend().from('opportunity_requirements').select('*').eq('opportunity_id', id).eq('is_current', true).order('version', { ascending: false }).order('id')
  if (error) throw error
  return data as Requirement[]
}
export async function getTracking(clubId: string, opportunityId: string) {
  const { data, error } = await backend().from('application_tracking').select('*').eq('club_id', clubId).eq('opportunity_id', opportunityId).maybeSingle()
  if (error) throw error
  return data as Tracking | null
}
export async function saveTracking(clubId: string, opportunityId: string, status: TrackingStatus, notes: string) {
  if (!Object.hasOwn(trackingStatuses, status) || notes.length > 10000) throw new Error('Choose a tracking status and keep notes within 10,000 characters.')
  // PostgREST upsert also updates conflict keys, which are intentionally immutable.
  const existing = await getTracking(clubId, opportunityId)
  const table = backend().from('application_tracking')
  const changes = { status, notes: notes.trim() || null }
  const query = existing
    ? table.update(changes).eq('id', existing.id).eq('club_id', clubId).eq('opportunity_id', opportunityId)
    : table.insert({ club_id: clubId, opportunity_id: opportunityId, ...changes })
  const { data, error } = await query.select('*').single()
  if (error) throw error
  return data as Tracking
}
// Curated links still get a protocol check before becoming clickable.
export function sourceLink(value: string | null) {
  if (!value) return undefined
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : undefined } catch { return undefined }
}

export async function listRules(id: string) {
  const { data, error } = await backend().from('opportunity_rules').select('*').eq('opportunity_id', id).eq('is_current', true).order('id')
  if (error) throw error
  return data as EligibilityRule[]
}
