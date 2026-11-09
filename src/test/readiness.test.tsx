const lifecycle = { state: 'up_to_date' as const, last_assessed_at: '2026-11-08T12:00:00Z' }
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import Readiness from '../components/Readiness'
import { requestAssessment, loadReadiness, type ReadinessRow, type EvidenceStatus } from '../services/readiness'
import { invalidateReadiness } from '../services/readiness-events'
vi.mock('../services/readiness', async original => ({ ...await original<typeof import('../services/readiness')>(), requestAssessment: vi.fn(), loadReadiness: vi.fn() }))
vi.mock('../services/documents', () => ({ documentUrl: vi.fn().mockResolvedValue('https://example.org/private') }))
const load = vi.mocked(loadReadiness)
const row = (status: EvidenceStatus = 'supplied'): ReadinessRow => ({
  requirement: { id: status, opportunity_id: 'opp', version: 2, description: `${status} requirement`, requirement_type: 'document', document_type: 'other', min_count: 1, source_note: 'Published description', is_current: true },
  mapping: { requirement_id: status, requirement_version: 2, mapping_type: 'document' },
  assessment: { id: status, club_id: 'club', opportunity_id: 'opp', requirement_id: status, requirement_version: 2, status, applicability: status === 'unknown' ? 'unknown' : status === 'not_applicable' ? 'not_applicable' : 'applicable', reason: 'Engine explanation', evaluated_at: '2026-11-08T12:00:00Z', processing_state: 'current' }, documents: [], activities: [],
})
function view(clubId = 'club', opportunityId: string | undefined = 'opp') { return <MemoryRouter><Readiness clubId={clubId} opportunityId={opportunityId} /></MemoryRouter> }
beforeEach(() => { load.mockReset(); load.mockResolvedValue({ lifecycle, rows: [] }) })
it('renders engine statuses, applicability, versions and exact support links accessibly', async () => {
  const supplied = row(); supplied.documents = [{ id: 'doc', club_id: 'club', file_name: 'registration.pdf' } as ReadinessRow['documents'][number]]
  supplied.activities = [{ id: 'act', club_id: 'club', title: 'Community match', date: '2026-11-01', activity_type: 'match' }]
  const conditional = row('unknown'); conditional.requirement.condition = { op: 'manual' }
  load.mockResolvedValue({ lifecycle, rows: [supplied, row('not_supplied'), row('expiring'), row('expired'), conditional, row('not_applicable')] })
  render(view())
  expect(screen.getByRole('status')).toHaveTextContent('Loading readiness')
  await screen.findByRole('heading', { name: 'supplied requirement' })
  for (const status of ['Supplied', 'Not supplied', 'Expiring', 'Expired', 'Unknown', 'Not applicable']) expect(screen.getByText(`Evidence status: ${status}`)).toBeInTheDocument()
  expect(screen.getByText(/Conditional; requires review/)).toBeInTheDocument()
  expect(screen.getAllByText('Evidence type: Other')).toHaveLength(6)
  expect(screen.getByRole('link', { name: 'Community match' })).toHaveAttribute('href', '/play-proof?activity=act')
  await userEvent.click(screen.getByRole('button', { name: 'Open registration.pdf' }))
  expect(await screen.findByRole('link', { name: 'registration.pdf' })).toHaveAttribute('href', 'https://example.org/private')
  expect(load).toHaveBeenCalledWith('club', 'opp')
  expect(screen.getByRole('region', { name: 'Evidence readiness' })).toBeInTheDocument()
  expect(screen.queryByText(/sample|fictional|\d+%/i)).not.toBeInTheDocument()
})
it('shows missing mappings, never assessed and stale as unknown without assuming missing evidence', async () => {
  const missing = row(); delete missing.mapping; delete missing.assessment
  const stale = row('expired'); stale.assessment!.processing_state = 'stale'
  load.mockResolvedValue({ lifecycle, rows: [missing, stale] })
  render(view())
  await screen.findByText('Readiness assessment not available for this requirement.')
  expect(screen.getAllByText('Evidence status: Unknown')).toHaveLength(2)
  expect(screen.getByText('Last assessed: Never assessed')).toBeInTheDocument()
})
it('handles RLS errors, refresh and empty results without mock fallback', async () => {
  load.mockRejectedValueOnce({ message: 'Permission denied' })
  render(view())
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  await userEvent.click(screen.getByRole('button', { name: 'Refresh readiness' }))
  expect(await screen.findByText('No current requirements are available for assessment.')).toBeInTheDocument()
})
it('clears old club results immediately and ignores late responses', async () => {
  let resolve!: (value: { lifecycle: typeof lifecycle; rows: ReadinessRow[] }) => void
  load.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const rendered = render(view()); rendered.rerender(view('other'))
  await screen.findByText('No current requirements are available for assessment.')
  await act(async () => resolve({ lifecycle, rows: [row()] }))
  expect(screen.queryByText('supplied requirement')).not.toBeInTheDocument()
  expect(load).toHaveBeenCalledWith('other', 'opp')
})
it('invalidates only the affected club and stops refresh work on unmount', async () => {
  const rendered = render(view()); await screen.findByText('No current requirements are available for assessment.')
  act(() => invalidateReadiness('other')); expect(load).toHaveBeenCalledTimes(1)
  act(() => invalidateReadiness('club'))
  await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('status')).toHaveTextContent('Assessment: Up to date')
  rendered.unmount(); act(() => invalidateReadiness('club')); expect(load).toHaveBeenCalledTimes(2)
})
it.each(['queued', 'running', 'failed', 'never_assessed'] as const)('renders safely exposed %s lifecycle', async state => {
  const result = row(); result.assessment!.processing_state = state
  load.mockResolvedValue({ lifecycle, rows: [result] }); render(view())
  await screen.findByText('Evidence status: Unknown')
  expect(screen.queryByText('Evidence status: Supplied')).not.toBeInTheDocument()
})

it('polls only pending lifecycle with a ten-minute cap and cancels on unmount', async () => {
  load.mockResolvedValue({ lifecycle: { state: 'queued', last_assessed_at: null }, rows: [] })
  vi.useFakeTimers()
  const rendered = render(view())
  try {
    await act(async () => { await Promise.resolve() })
    await act(async () => { invalidateReadiness('club'); await Promise.resolve() })
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(load).toHaveBeenCalledTimes(8)
    await act(async () => { await vi.advanceTimersByTimeAsync(600_000) })
    expect(load).toHaveBeenCalledTimes(122)
    act(() => invalidateReadiness('club'))
    rendered.unmount()
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(load).toHaveBeenCalledTimes(123)
  } finally { rendered.unmount(); vi.useRealTimers() }
})

it('hides supplied counts when authoritative freshness reports catalogue lag', async () => {
  load.mockResolvedValue({ lifecycle: { state: 'stale', last_assessed_at: null }, rows: [row()] })
  render(view())
  await screen.findByText('Assessment: Stale')
  expect(screen.getByText('Evidence status: Updating')).toBeInTheDocument()
  expect(screen.queryByText('Evidence status: Supplied')).not.toBeInTheDocument()
})
it('uses the secured request endpoint, displays throttling and preserves errors', async () => {
  const request = vi.mocked(requestAssessment)
  request.mockResolvedValueOnce({ accepted: true, retry_after_seconds: 60 })
  request.mockResolvedValueOnce({ accepted: false, retry_after_seconds: 58 })
  request.mockRejectedValueOnce(new Error('Club access denied'))
  render(view())
  await screen.findByText('No current requirements are available for assessment.')
  await userEvent.click(screen.getByRole('button', { name: 'Refresh assessment' }))
  expect(await screen.findByText('Assessment requested. Reassessment may take time.')).toBeInTheDocument()
  expect(request).toHaveBeenCalledWith('club')
  await userEvent.click(screen.getByRole('button', { name: 'Refresh assessment' }))
  expect(await screen.findByText('Assessment request rate limited. Try again in 58 seconds.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Refresh assessment' }))
  expect(await screen.findByText('Could not request assessment: Club access denied')).toBeInTheDocument()
})
it('stops polling as soon as the server returns up_to_date', async () => {
  vi.useFakeTimers()
  load.mockResolvedValueOnce({ lifecycle: { state: 'queued', last_assessed_at: null }, rows: [] })
  const rendered = render(view())
  try {
    await act(async () => { await Promise.resolve() })
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
    expect(load).toHaveBeenCalledTimes(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(load).toHaveBeenCalledTimes(2)
  } finally { rendered.unmount(); vi.useRealTimers() }
})

it('keeps the server lifecycle separate from an inconsistent multi-read snapshot', async () => {
  load.mockResolvedValue({ lifecycle, consistent: false, rows: [row()] })
  render(view())
  await screen.findByText('Assessment: Up to date')
  expect(screen.getByText('Assessment changed while loading. Refresh readiness to reload its evidence.')).toBeInTheDocument()
  expect(screen.getByText('Evidence status: Updating')).toBeInTheDocument()
})
