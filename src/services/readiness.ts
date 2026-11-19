import { backend } from './supabase'
import type { Requirement } from './opportunities'
import type { Evidence } from '../types/club'

export type EvidenceStatus = 'supplied' | 'not_supplied' | 'expiring' | 'expired' | 'unknown' | 'not_applicable'
export type ProcessingState = 'never_assessed' | 'queued' | 'running' | 'current' | 'stale' | 'failed'
export interface Assessment {
  id: string; club_id: string; opportunity_id: string; requirement_id: string; requirement_version: number
  status: EvidenceStatus; applicability: 'applicable' | 'not_applicable' | 'unknown'; reason: string
  evaluated_at: string | null; processing_state: ProcessingState
}
export interface Mapping { requirement_id: string; requirement_version: number; mapping_type: 'document' | 'activity' | 'club_info' | 'unsupported'; activity_type?: string | null }
export interface SupportingActivity { id: string; club_id: string; title: string; date: string; activity_type: string }
interface SupportLink { result_id: string; club_id: string; evidence_id: string | null; activity_id: string | null }
export interface ReadinessRow { requirement: Requirement; mapping?: Mapping; assessment?: Assessment; documents: Evidence[]; activities: SupportingActivity[] }
export type LifecycleState = 'never_assessed' | 'queued' | 'processing' | 'up_to_date' | 'stale' | 'failed'
export interface ReadinessLifecycle { state: LifecycleState; last_assessed_at: string | null }
export interface ReadinessSnapshot { rows: ReadinessRow[]; lifecycle: ReadinessLifecycle; consistent?: boolean }
export const lifecycleLabels: Record<LifecycleState, string> = { never_assessed: 'Never assessed', queued: 'Queued', processing: 'Processing', up_to_date: 'Up to date', stale: 'Stale', failed: 'Failed' }
export async function loadLifecycle(clubId: string): Promise<ReadinessLifecycle> {
  const { data, error } = await backend().rpc('readiness_lifecycle', { p_club: clubId })
  if (error) throw error
  if (!data || !Object.hasOwn(lifecycleLabels, data.state)) throw new Error('Assessment lifecycle unavailable.')
  return data as ReadinessLifecycle
}
export async function requestAssessment(clubId: string): Promise<{ accepted: boolean; retry_after_seconds: number }> {
  const { data, error } = await backend().rpc('request_readiness_assessment', { p_club: clubId })
  if (error) throw error
  return data
}
// Page every read: PostgREST's default row cap must not silently truncate summaries.
async function read<T>(table: string, filters: Record<string, string | boolean> = {}, ids?: { column: string; values: string[] }): Promise<T[]> {
  if (ids && !ids.values.length) return []
  const rows: T[] = []
  for (let offset = 0; ; offset += 500) {
    let query = backend().from(table).select('*').order(table === 'readiness_requirement_mappings' ? 'requirement_id' : 'id').range(offset, offset + 499)
    for (const [key, value] of Object.entries(filters)) query = query.eq(key, value)
    if (ids) query = query.in(ids.column, ids.values)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data || []) as T[])
    if (!data || data.length < 500) return rows
  }
}
async function supports<T>(table: string, clubId: string, ids: string[]): Promise<T[]> {
  const rows: T[] = []
  const unique = [...new Set(ids)]
  for (let start = 0; start < unique.length; start += 100) rows.push(...await read<T>(table, { club_id: clubId }, { column: 'id', values: unique.slice(start, start + 100) }))
  return rows
}
export async function loadReadiness(clubId: string, opportunityId?: string): Promise<ReadinessSnapshot> {
  if (!clubId) throw new Error('Choose a club to view readiness.')
  const before = await loadLifecycle(clubId)
  const scope: Record<string, string | boolean> = opportunityId ? { opportunity_id: opportunityId } : {}
  const [requirements, mappings, results, links] = await Promise.all([
    read<Requirement>('opportunity_requirements', { ...scope, is_current: true }),
    read<Mapping>('readiness_requirement_mappings', scope),
    read<Assessment>('readiness_results', { ...scope, club_id: clubId }),
    read<SupportLink>('readiness_result_evidence', { club_id: clubId }),
  ])
  // Explicit scope checks supplement RLS; no cross-club data is rendered even on malformed responses.
  if (results.some(row => row.club_id !== clubId) || links.some(row => row.club_id !== clubId)) throw new Error('Readiness club scope mismatch.')
  const resultIds = new Set(results.map(row => row.id))
  const selected = links.filter(link => resultIds.has(link.result_id))
  const [documents, activities] = await Promise.all([
    supports<Evidence>('evidence', clubId, selected.flatMap(link => link.evidence_id ? [link.evidence_id] : [])),
    supports<SupportingActivity>('activities', clubId, selected.flatMap(link => link.activity_id ? [link.activity_id] : [])),
  ])
  if ([...documents, ...activities].some(row => row.club_id !== clubId)) throw new Error('Readiness support scope mismatch.')
  const after = await loadLifecycle(clubId)
  // Separate SELECTs can straddle a worker commit. Never label a mixed snapshot current.
  const consistent = before.state === after.state && before.last_assessed_at === after.last_assessed_at
  return { lifecycle: after, consistent, rows: requirements.filter(row => !opportunityId || row.opportunity_id === opportunityId).map(requirement => {
    const mapping = mappings.find(row => row.requirement_id === requirement.id && row.requirement_version === requirement.version)
    const assessment = results.find(row => row.requirement_id === requirement.id && row.opportunity_id === requirement.opportunity_id && row.requirement_version === requirement.version)
    const exact = selected.filter(link => link.result_id === assessment?.id)
    return { requirement, mapping, assessment,
      documents: documents.filter(document => exact.some(link => link.evidence_id === document.id)),
      activities: activities.filter(activity => exact.some(link => link.activity_id === activity.id)) }
  }) }
}
export const statusLabels: Record<EvidenceStatus, string> = { supplied: 'Supplied', not_supplied: 'Not supplied', expiring: 'Expiring', expired: 'Expired', unknown: 'Unknown', not_applicable: 'Not applicable' }
export const processingLabels: Record<ProcessingState, string> = { never_assessed: 'Never assessed', queued: 'Queued', running: 'Processing', current: 'Up to date in stored snapshot', stale: 'Stale', failed: 'Failed' }
export function evidenceStatus(row: ReadinessRow): EvidenceStatus {
  return !row.mapping || row.mapping.mapping_type === 'unsupported' || !row.assessment || row.assessment.processing_state !== 'current' ? 'unknown' : row.assessment.status
}
