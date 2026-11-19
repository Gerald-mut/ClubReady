import { beforeEach, expect, it, vi } from 'vitest'
import { loadReadiness, requestAssessment } from '../services/readiness'
const state = vi.hoisted(() => ({ rpc: vi.fn(), tables: {} as Record<string, unknown[]>, calls: [] as { table: string; filters: Record<string, unknown>; ids?: unknown[] }[], error: null as unknown }))
vi.mock('../services/supabase', () => ({ backend: () => ({ rpc: state.rpc, from(table: string) {
  const call = { table, filters: {} as Record<string, unknown>, ids: undefined as unknown[] | undefined }; state.calls.push(call)
  const query = { select: () => query, order: () => query, range: () => query, eq: (key: string, value: unknown) => { call.filters[key] = value; return query }, in: (_key: string, ids: unknown[]) => { call.ids = ids; return query }, then: (resolve: (value: unknown) => void) => Promise.resolve({ data: state.tables[table] || [], error: state.error }).then(resolve) }
  return query
} }) }))
beforeEach(() => { state.rpc.mockReset(); state.rpc.mockResolvedValue({ data: { state: 'up_to_date', last_assessed_at: null }, error: null }); state.calls = []; state.error = null; state.tables = {
  opportunity_requirements: [{ id: 'req', opportunity_id: 'opp', version: 2 }],
  readiness_requirement_mappings: [{ requirement_id: 'req', requirement_version: 2, mapping_type: 'activity' }],
  readiness_results: [{ id: 'result', club_id: 'club', opportunity_id: 'opp', requirement_id: 'req', requirement_version: 2 }],
  readiness_result_evidence: [{ result_id: 'result', club_id: 'club', evidence_id: 'doc', activity_id: null }, { result_id: 'result', club_id: 'club', evidence_id: null, activity_id: 'act' }],
  evidence: [{ id: 'doc', club_id: 'club' }, { id: 'unlinked', club_id: 'club' }], activities: [{ id: 'act', club_id: 'club' }],
} })
it('fetches opportunity scope, exact support IDs and current requirement versions through member reads', async () => {
  const result = await loadReadiness('club', 'opp')
  expect(result.rows[0].documents.map(row => row.id)).toEqual(['doc'])
  expect(result.rows[0].activities.map(row => row.id)).toEqual(['act'])
  expect(state.calls.find(row => row.table === 'readiness_results')?.filters).toEqual({ club_id: 'club', opportunity_id: 'opp' })
  expect(state.calls.find(row => row.table === 'evidence')).toMatchObject({ filters: { club_id: 'club' }, ids: ['doc'] })
  expect(state.calls.some(row => /processing_jobs|private/.test(row.table))).toBe(false)
})
it('does not attach previous-version assessments and supports to current requirements', async () => {
  state.tables.readiness_results = [{ id: 'result', club_id: 'club', opportunity_id: 'opp', requirement_id: 'req', requirement_version: 1 }]
  const result = await loadReadiness('club')
  expect(result.rows[0].assessment).toBeUndefined(); expect(result.rows[0].documents).toEqual([])
})
it('propagates RLS errors instead of returning an empty or fictional assessment', async () => {
  state.error = { message: 'permission denied', code: '42501' }
  await expect(loadReadiness('club')).rejects.toEqual(state.error)
})
it('rejects cross-club results and support records', async () => {
  state.tables.readiness_results = [{ club_id: 'other' }]
  await expect(loadReadiness('club')).rejects.toThrow('scope mismatch')
  state.tables.readiness_results = []; state.tables.readiness_result_evidence = [{ club_id: 'other' }]
  await expect(loadReadiness('club')).rejects.toThrow('scope mismatch')
})
it('rejects an absent club before making a query', async () => {
  await expect(loadReadiness('')).rejects.toThrow('Choose a club')
  expect(state.calls).toEqual([])
})

it('requests only the club identity and propagates server throttling', async () => {
  state.rpc.mockResolvedValue({ data: { accepted: false, retry_after_seconds: 59 }, error: null })
  expect(await requestAssessment('club')).toEqual({ accepted: false, retry_after_seconds: 59 })
  expect(state.rpc).toHaveBeenCalledExactlyOnceWith('request_readiness_assessment', { p_club: 'club' })
})
it('rejects lifecycle denial before reading private snapshots', async () => {
  state.rpc.mockResolvedValue({ error: { message: 'Club access denied', code: '42501' } })
  await expect(loadReadiness('club')).rejects.toMatchObject({ code: '42501' })
  expect(state.calls).toEqual([])
})
it('marks snapshots stale if reads straddle a worker completion', async () => {
  state.rpc.mockResolvedValueOnce({ data: { state: 'up_to_date', last_assessed_at: '2026-11-08T12:00:00Z' }, error: null })
  state.rpc.mockResolvedValueOnce({ data: { state: 'up_to_date', last_assessed_at: '2026-11-08T12:01:00Z' }, error: null })
  const snapshot = await loadReadiness('club')
  expect(snapshot.consistent).toBe(false)
  expect(snapshot.lifecycle.state).toBe('up_to_date')
})
