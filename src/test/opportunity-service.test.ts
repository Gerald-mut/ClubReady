import { beforeEach, expect, it, vi } from 'vitest'
import { getTracking, listRequirements, saveTracking, sourceLink } from '../services/opportunities'
const mock = vi.hoisted(() => ({ from: vi.fn(), select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn(), single: vi.fn(), insert: vi.fn(), update: vi.fn() }))
vi.mock('../services/supabase', () => ({ backend: () => ({ from: mock.from }) }))
beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  for (const name of ['from', 'select', 'eq', 'order', 'insert', 'update'] as const) mock[name].mockReturnValue(mock)
  mock.maybeSingle.mockResolvedValue({ data: null, error: null })
  mock.single.mockResolvedValue({ data: { id: 'new', status: 'preparing' }, error: null })
})
it('inserts only editable tracking fields and the scoped identity', async () => {
  await saveTracking('club-a', 'opportunity-a', 'preparing', '  Draft  ')
  expect(mock.eq.mock.calls).toEqual([['club_id', 'club-a'], ['opportunity_id', 'opportunity-a']])
  expect(mock.insert).toHaveBeenCalledWith({ club_id: 'club-a', opportunity_id: 'opportunity-a', status: 'preparing', notes: 'Draft' })
  expect(mock.update).not.toHaveBeenCalled()
})
it('updates an existing row without writing protected identity or audit fields', async () => {
  mock.maybeSingle.mockResolvedValue({ data: { id: 'existing' }, error: null })
  await saveTracking('club-a', 'opportunity-a', 'submitted', ' ')
  expect(mock.update).toHaveBeenCalledWith({ status: 'submitted', notes: null })
  expect(mock.eq.mock.calls.slice(-3)).toEqual([['id', 'existing'], ['club_id', 'club-a'], ['opportunity_id', 'opportunity-a']])
  expect(mock.insert).not.toHaveBeenCalled()
})
it('propagates denied writes and rejects excessive notes before any request', async () => {
  const failure = { message: 'Permission denied' }
  mock.single.mockResolvedValue({ data: null, error: failure })
  await expect(saveTracking('club', 'opportunity', 'preparing', 'Draft')).rejects.toEqual(failure)
  mock.from.mockClear()
  await expect(saveTracking('club', 'opportunity', 'preparing', 'x'.repeat(10001))).rejects.toThrow('10,000')
  expect(mock.from).not.toHaveBeenCalled()
})
it('does not attempt writes when reading tracking fails', async () => {
  mock.maybeSingle.mockResolvedValue({ data: null, error: new Error('Offline') })
  await expect(saveTracking('club', 'opportunity', 'preparing', '')).rejects.toThrow('Offline')
  expect(mock.insert).not.toHaveBeenCalled(); expect(mock.update).not.toHaveBeenCalled()
  await expect(getTracking('club', 'opportunity')).rejects.toThrow('Offline')
})
it('requests only current requirements for the selected opportunity', async () => {
  mock.order.mockReturnValueOnce(mock).mockResolvedValueOnce({ data: [], error: null })
  expect(await listRequirements('opportunity-a')).toEqual([])
  expect(mock.eq.mock.calls).toEqual([['opportunity_id', 'opportunity-a'], ['is_current', true]])
})
it('only permits HTTPS links', () => {
  expect(sourceLink('https://example.org/rules')).toBe('https://example.org/rules')
  for (const value of [null, 'javascript:alert(1)', 'data:text/html,test', '/relative', 'http://example.org', 'broken']) expect(sourceLink(value)).toBeUndefined()
})
