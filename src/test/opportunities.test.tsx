import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import Opportunities from '../pages/Opportunities'
import OpportunityDetail from '../pages/Opportunities/Detail'
import { AuthContext } from '../contexts/auth-state'
import { ClubContext } from '../contexts/club-state'
import type { Club, Evidence } from '../types/club'
import type { CatalogueOpportunity, Requirement, Tracking } from '../services/opportunities'
const mock = vi.hoisted(() => ({ listOpportunities: vi.fn(), getOpportunity: vi.fn(), listRequirements: vi.fn(), listRules: vi.fn(), getTracking: vi.fn(), saveTracking: vi.fn(), listDocuments: vi.fn(), listActivities: vi.fn() }))
vi.mock('../services/opportunities', async importOriginal => ({ ...await importOriginal<typeof import('../services/opportunities')>(), ...mock }))
vi.mock('../services/documents', () => ({ listDocuments: mock.listDocuments }))
vi.mock('../db/offline', () => ({ listActivities: mock.listActivities }))
const opportunity: CatalogueOpportunity = { id: 'one', title: 'Example fund', organiser: 'Provider', description: 'Past funding round.', source_url: 'https://example.org/source', application_method: 'Closed applications.', application_url: null, deadline: null, status: 'historical', review_date: '2026-11-08', is_demonstration: true }
const requirements: Requirement[] = [
  { id: 'r1', opportunity_id: 'one', version: 1, requirement_type: 'document', document_type: 'club_registration', description: 'Registration certificate', min_count: 1, source_note: 'https://example.org/rules — page 2', is_current: true },
  { id: 'r2', opportunity_id: 'one', version: 1, requirement_type: 'document', document_type: 'financial_report', description: 'Audited accounts', min_count: 1, source_note: 'Page 2', is_current: true },
  { id: 'r3', opportunity_id: 'one', version: 1, requirement_type: 'activity', document_type: null, description: 'Weekly activities', min_count: null, source_note: 'Page 3', is_current: true },
  { id: 'r4', opportunity_id: 'one', version: 1, requirement_type: 'club_info', document_type: null, description: 'Social mission', min_count: null, source_note: 'Page 1', is_current: true },
]
const tracking: Tracking = { id: 'tracking', club_id: 'club', opportunity_id: 'one', status: 'preparing', notes: 'Club notes', updated_by: 'user', updated_at: '2026-11-08T12:00:00Z' }
beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  mock.listOpportunities.mockResolvedValue([opportunity]); mock.getOpportunity.mockResolvedValue(opportunity)
  mock.listRequirements.mockResolvedValue(requirements); mock.listRules.mockResolvedValue([]); mock.getTracking.mockResolvedValue(null)
  mock.listDocuments.mockResolvedValue([{ document_type: 'club_registration' } as Evidence]); mock.listActivities.mockResolvedValue([{ id: 'local' }])
  mock.saveTracking.mockResolvedValue(tracking)
})
function Flow({ path = '/opportunities/one', admin = true, clubId = 'club', userId = 'user' }: { path?: string; admin?: boolean; clubId?: string; userId?: string }) {
  return <AuthContext.Provider value={{ session: { user: { id: userId } } as Session, loading: false, error: '', recovery: false, finishRecovery: vi.fn() }}><ClubContext.Provider value={{ selection: { club: { id: clubId, name: 'My club' } as Club, membership: { club_id: clubId, user_id: userId, role: admin ? 'club_admin' : 'club_member', joined_at: '' } }, loading: false, error: '', refresh: vi.fn() }}><MemoryRouter initialEntries={[path]}><Routes><Route path="/opportunities" element={<Opportunities />} /><Route path="/opportunities/:id" element={<OpportunityDetail />} /></Routes></MemoryRouter></ClubContext.Provider></AuthContext.Provider>
}
it('lists status, demonstration label and review date, then opens detail', async () => {
  render(<Flow path="/opportunities" />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading opportunities')
  await userEvent.click(await screen.findByRole('link', { name: 'Example fund' }))
  expect(await screen.findByRole('heading', { name: 'Example fund' })).toBeInTheDocument()
  expect(screen.getByText('Historical')).toBeInTheDocument(); expect(screen.getByText('Demonstration only')).toBeInTheDocument()
  expect(screen.getAllByText(/Reviewed 2026-11-08/, { selector: 'p' }).length).toBeGreaterThan(0)
})
it('compares documents and account-scoped local activities with source links', async () => {
  render(<Flow />)
  const table = await screen.findByRole('table')
  expect(within(within(table).getByText('Registration certificate').closest('tr')!).getByText('Supplied')).toBeInTheDocument()
  expect(within(within(table).getByText('Audited accounts').closest('tr')!).getByText('Not supplied')).toBeInTheDocument()
  expect(within(table).getByText('Your local activity records: 1')).toBeInTheDocument()
  expect(within(screen.getByText('Social mission').closest('tr')!).getByText('No automatic category match')).toBeInTheDocument()
  expect(screen.getByText(/not other members or devices/)).toBeInTheDocument()
  expect(screen.getAllByRole('link', { name: /Requirement source/ })[0]).toHaveAttribute('href', 'https://example.org/rules')
  expect(mock.listDocuments).toHaveBeenCalledWith('club'); expect(mock.listActivities).toHaveBeenCalledWith('user', 'club')
  expect(screen.queryByRole('link', { name: /Application website/ })).not.toBeInTheDocument()
})
it('loads saved tracking read-only for members', async () => {
  mock.getTracking.mockResolvedValue(tracking)
  render(<Flow admin={false} />)
  expect(await screen.findByText('Club notes')).toBeInTheDocument()
  expect(screen.getByText('Preparing')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Save tracking' })).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Application notes')).not.toBeInTheDocument()
  expect(mock.saveTracking).not.toHaveBeenCalled()
})
it('saves admin status and notes, locking the form during submission', async () => {
  let resolve!: (row: Tracking) => void
  mock.saveTracking.mockReturnValue(new Promise<Tracking>(done => { resolve = done }))
  render(<Flow />)
  await screen.findByLabelText('Application status')
  await userEvent.selectOptions(screen.getByLabelText('Application status'), 'preparing')
  await userEvent.type(screen.getByLabelText('Application notes'), 'Club notes')
  fireEvent.submit(screen.getByRole('button', { name: 'Save tracking' }).closest('form')!)
  expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
  expect(screen.getByLabelText('Application status')).toBeDisabled()
  expect(mock.saveTracking).toHaveBeenCalledWith('club', 'one', 'preparing', 'Club notes')
  resolve(tracking)
  expect(await screen.findByText('Application tracking saved.')).toBeInTheDocument()
})
it('retains draft on tracking failure and permits retry', async () => {
  mock.saveTracking.mockRejectedValueOnce(new Error('Permission denied'))
  render(<Flow />)
  await userEvent.type(await screen.findByLabelText('Application notes'), 'Draft')
  fireEvent.submit(screen.getByRole('button', { name: 'Save tracking' }).closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('Permission denied')
  expect(screen.getByLabelText('Application notes')).toHaveValue('Draft')
  fireEvent.submit(screen.getByRole('button', { name: 'Save tracking' }).closest('form')!)
  expect(await screen.findByText('Application tracking saved.')).toBeInTheDocument()
})
it('shows missing and empty catalogue states', async () => {
  mock.listOpportunities.mockResolvedValue([])
  const view = render(<Flow path="/opportunities" />)
  expect(await screen.findByText('No opportunities have been published yet.')).toBeInTheDocument()
  view.unmount(); mock.getOpportunity.mockResolvedValue(null)
  render(<Flow />)
  expect(await screen.findByRole('heading', { name: 'Opportunity not found' })).toBeInTheDocument()
})
it('retries catalogue and detail load errors', async () => {
  mock.listOpportunities.mockRejectedValueOnce(new Error('Offline'))
  const view = render(<Flow path="/opportunities" />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('link', { name: 'Example fund' })
  view.unmount(); mock.getOpportunity.mockRejectedValueOnce(new Error('Detail failed'))
  render(<Flow />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Detail failed')
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByRole('heading', { name: 'Example fund' })
})
it('does not report missing evidence when the evidence request fails', async () => {
  mock.listDocuments.mockRejectedValueOnce(new Error('Evidence unavailable'))
  render(<Flow />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Evidence unavailable')
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByRole('table')).toBeInTheDocument()
})
it('clears private drafts after club, account or role changes', async () => {
  const view = render(<Flow />)
  await userEvent.type(await screen.findByLabelText('Application notes'), 'Private draft')
  view.rerender(<Flow clubId="other-club" userId="other-user" admin={false} />)
  expect(screen.queryByText('Private draft')).not.toBeInTheDocument()
  expect(screen.queryByLabelText('Application notes')).not.toBeInTheDocument()
  await waitFor(() => expect(mock.listActivities).toHaveBeenCalledWith('other-user', 'other-club'))
  expect(await screen.findByText('No notes added.')).toBeInTheDocument()
})

it('ignores late tracking results from a previous account', async () => {
  let resolve!: (row: Tracking) => void
  mock.getTracking.mockReturnValueOnce(new Promise<Tracking>(done => { resolve = done }))
  const view = render(<Flow />)
  view.rerender(<Flow userId="next-user" clubId="next-club" admin={false} />)
  await screen.findByText('No notes added.')
  resolve(tracking)
  await waitFor(() => expect(screen.queryByText('Club notes')).not.toBeInTheDocument())
})
it('shows open application links, an empty requirements message and zero local records', async () => {
  mock.getOpportunity.mockResolvedValue({ ...opportunity, status: 'open', verification_status: 'official_source_reviewed', last_verified_at: '2026-11-08', next_review_at: '2099-01-01', opens_at: '2020-01-01', deadline: '2099-12-31', is_demonstration: false, application_url: 'https://example.org/apply' })
  mock.listRequirements.mockResolvedValue([]); mock.listActivities.mockResolvedValue([])
  render(<Flow />)
  expect(await screen.findByRole('link', { name: /Application website/ })).toHaveAttribute('href', 'https://example.org/apply')
  expect(await screen.findByText('No current requirements have been published.')).toBeInTheDocument()
  expect(screen.getByText('Your local activity records: 0')).toBeInTheDocument()
  expect(screen.queryByText('Demonstration only')).not.toBeInTheDocument()
})

it('filters by type, scope, availability and text with an empty-match state', async () => {
  mock.listOpportunities.mockResolvedValue([
    { ...opportunity, opportunity_type: 'foundation_grant', geographic_scope: ['KE'] },
    { ...opportunity, id: 'platform', title: 'GlobalGiving', opportunity_type: 'fundraising_platform', geographic_scope: ['international'], status: 'unconfirmed', is_demonstration: false },
  ])
  render(<Flow path="/opportunities" />)
  await screen.findByRole('link', { name: 'GlobalGiving' })
  await userEvent.selectOptions(screen.getByLabelText('Opportunity type'), 'fundraising_platform')
  expect(screen.queryByRole('link', { name: 'Example fund' })).not.toBeInTheDocument()
  await userEvent.selectOptions(screen.getByLabelText('Availability'), 'unconfirmed')
  await userEvent.selectOptions(screen.getByLabelText('Country / scope'), 'international')
  expect(screen.getByRole('link', { name: 'GlobalGiving' })).toBeInTheDocument()
  await userEvent.type(screen.getByLabelText('Search opportunities'), 'missing')
  expect(screen.getByText('No opportunities match these filters.')).toBeInTheDocument()
})
it('shows explainable unknown and failed aggregate criteria without collecting identity documents', async () => {
  mock.getOpportunity.mockResolvedValue({ ...opportunity, slug: 'safaricom-chapa-dimba-2026', status: 'unconfirmed' })
  mock.listRules.mockResolvedValue([{ id: 'rule', label: 'Girls participation', explanation: '20% minimum', mandatory: true, verification: 'verified', source_reference: { url: 'https://example.org/criteria', publisher: 'Provider', title: 'Criteria', verified_at: '2026-11-08' }, expression: { op: 'gte', field: 'girlsParticipantShare', value: 20 } }])
  render(<Flow />)
  expect(await screen.findByRole('heading', { name: 'Club readiness' })).toBeInTheDocument()
  expect(screen.getByText('Insufficient information')).toBeInTheDocument()
  expect(screen.getByText(/Player identity and parental consent documents must be submitted directly/)).toBeInTheDocument()
  fireEvent.change(screen.getByLabelText(/Girls participating/), { target: { value: '19' } })
  expect(screen.getByText('Ineligible under the supplied answers')).toBeInTheDocument()
  expect(screen.queryByLabelText(/NEMIS|birth date|consent|identity document/i)).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Application website/ })).not.toBeInTheDocument()
})
it('keeps a closed or stale call from exposing an application link', async () => {
  mock.getOpportunity.mockResolvedValue({ ...opportunity, status: 'closed', application_url: 'https://example.org/apply' })
  const view = render(<Flow />)
  await screen.findByRole('heading', { name: 'Example fund' })
  expect(screen.queryByRole('link', { name: /Application website/ })).not.toBeInTheDocument()
  view.unmount()
  mock.getOpportunity.mockResolvedValue({ ...opportunity, status: 'open', application_url: 'https://example.org/apply', verification_status: 'official_source_reviewed', next_review_at: '2000-01-01' })
  render(<Flow />)
  await screen.findByRole('heading', { name: 'Example fund' })
  expect(screen.getByText('Status unconfirmed')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Application website/ })).not.toBeInTheDocument()
})
