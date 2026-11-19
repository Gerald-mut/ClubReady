const lifecycle = { state: 'up_to_date' as const, last_assessed_at: '2026-11-08T12:00:00Z' }
import { render, screen } from '@testing-library/react'
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
const mock = vi.hoisted(() => ({ loadReadiness: vi.fn(), listOpportunities: vi.fn(), getOpportunity: vi.fn(), listRequirements: vi.fn(), listRules: vi.fn(), getTracking: vi.fn(), saveTracking: vi.fn(), listDocuments: vi.fn(), listActivities: vi.fn() }))
vi.mock('../services/opportunities', async importOriginal => ({ ...await importOriginal<typeof import('../services/opportunities')>(), ...mock }))
vi.mock('../services/readiness', async original => ({ ...await original<typeof import('../services/readiness')>(), loadReadiness: mock.loadReadiness }))
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
  mock.loadReadiness.mockResolvedValue({ lifecycle, rows: requirements.map(requirement => ({ requirement, documents: [], activities: [] })) })
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
  expect(screen.queryByText('Application tracking')).not.toBeInTheDocument()
  expect(mock.getTracking).not.toHaveBeenCalled()
})
it('renders the real scoped readiness reader without local evidence inference', async () => {
  render(<Flow />)
  await screen.findByRole('heading', { name: 'Registration certificate' })
  expect(mock.loadReadiness).toHaveBeenCalledWith('club', 'one')
  expect(screen.getAllByText('Readiness assessment not available for this requirement.')).toHaveLength(4)
  expect(mock.listActivities).not.toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: /Application website/ })).not.toBeInTheDocument()
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
it('shows open application links, an empty requirements message and zero local records', async () => {
  mock.getOpportunity.mockResolvedValue({ ...opportunity, status: 'open', verification_status: 'official_source_reviewed', last_verified_at: '2026-11-08', next_review_at: '2099-01-01', opens_at: '2020-01-01', deadline: '2099-12-31', is_demonstration: false, application_url: 'https://example.org/apply' })
  mock.listRequirements.mockResolvedValue([]); mock.loadReadiness.mockResolvedValue({ lifecycle, rows: [] })
  render(<Flow />)
  expect(await screen.findByRole('link', { name: /Application website/ })).toHaveAttribute('href', 'https://example.org/apply')
  expect(await screen.findByText('No current requirements are available for assessment.')).toBeInTheDocument()
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

it('makes the entire card a link and returns to the catalogue', async () => {
  render(<Flow path="/opportunities" />)
  const link = await screen.findByRole('link', { name: 'Example fund' })
  expect(link).toHaveAttribute('href', '/opportunities/one')
  await userEvent.click(screen.getByText('View opportunity →'))
  await screen.findByRole('heading', { name: 'Example fund' })
  await userEvent.click(screen.getByRole('link', { name: 'Back to opportunities' }))
  expect(await screen.findByRole('heading', { name: 'Opportunities' })).toBeInTheDocument()
})
it('handles missing descriptions and instructions without inventing them', async () => {
  mock.getOpportunity.mockResolvedValue({ ...opportunity, description: '', application_method: '' })
  render(<Flow />)
  expect(await screen.findByText('Description unavailable. Consult the official source.')).toBeInTheDocument()
  expect(screen.getByText(/Application instructions are unavailable/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /Original source/ })).toHaveAttribute('href', opportunity.source_url)
})
