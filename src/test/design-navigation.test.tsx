import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import AppShell from '../components/AppShell'
import Home from '../pages/Home'
import { AuthContext } from '../contexts/auth-state'
import { ClubContext } from '../contexts/club-state'
import type { Club } from '../types/club'
const mock = vi.hoisted(() => ({ listActivities: vi.fn(), listDocuments: vi.fn(), listOpportunities: vi.fn(), signOut: vi.fn() }))
vi.mock('../components/ActivitySync', () => ({ default: () => null }))
vi.mock('../components/PwaStatus', () => ({ default: () => null }))
vi.mock('../db/offline', () => ({ listActivities: mock.listActivities }))
vi.mock('../services/documents', () => ({ listDocuments: mock.listDocuments }))
vi.mock('../services/opportunities', async original => ({ ...await original<typeof import('../services/opportunities')>(), listOpportunities: mock.listOpportunities }))
vi.mock('../services/supabase', () => ({ backend: () => ({ auth: { signOut: mock.signOut } }), message: (error: Error) => error.message }))
function Frame({ path = '/', signedIn = true, clubId = 'club', home = false }: { path?: string; signedIn?: boolean; clubId?: string; home?: boolean }) {
  return <AuthContext.Provider value={{ session: signedIn ? { user: { id: 'user', email: 'coach@example.com' } } as Session : null, loading: false, error: '', recovery: false, finishRecovery: vi.fn() }}><ClubContext.Provider value={{ selection: { club: { id: clubId, name: clubId === 'club' ? 'Test Club' : 'Next Club', county: 'Nairobi', year_established: 2020 } as Club, membership: { club_id: clubId, user_id: 'user', role: 'club_admin', joined_at: '' } }, loading: false, error: '', refresh: vi.fn() }}><MemoryRouter initialEntries={[path]}><AppShell>{home ? <Home /> : <h1>Page content</h1>}</AppShell></MemoryRouter></ClubContext.Provider></AuthContext.Provider>
}
beforeEach(() => {
  vi.clearAllMocks()
  mock.listActivities.mockResolvedValue([{ id: 'local' }]); mock.listDocuments.mockResolvedValue([])
  mock.listOpportunities.mockResolvedValue([{ id: 'fund', title: 'Historical fund', organiser: 'Provider', status: 'historical', is_demonstration: true, deadline: null }])
  mock.signOut.mockResolvedValue({ error: null })
})
it.each(['/sign-in', '/sign-up', '/forgot-password', '/reset-password'])('omits authenticated navigation on %s even with a session', path => {
  render(<Frame path={path} />)
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Account menu' })).not.toBeInTheDocument()
})
it('shows active Explore navigation on opportunity details and keeps signout accessible', async () => {
  render(<Frame path="/opportunities/fund" />)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getByRole('link', { name: 'Explore' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
  expect(screen.queryByText('coach@example.com')).not.toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Account menu' }))
  expect(screen.getByText('coach@example.com')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Sign out' }))
  expect(mock.signOut).toHaveBeenCalledOnce()
})
it('renders real scoped Home statistics, feature action and historical opportunity labels', async () => {
  render(<Frame home />)
  expect(screen.getByRole('heading', { name: 'Test Club.' })).toBeInTheDocument()
  expect(screen.getByText('Nairobi · Est. 2020')).toBeInTheDocument()
  expect(await screen.findByText('1')).toBeInTheDocument()
  expect(screen.getByText('0')).toBeInTheDocument()
  expect(mock.listActivities).toHaveBeenCalledWith('user', 'club')
  expect(mock.listDocuments).toHaveBeenCalledWith('club')
  expect(screen.getByRole('link', { name: 'Record an activity' })).toHaveAttribute('href', '/play-proof')
  expect(await screen.findByText('Historical')).toBeInTheDocument()
  expect(screen.getByText('Demonstration only')).toBeInTheDocument()
})
it('reports service failure without turning it into false zero statistics', async () => {
  mock.listDocuments.mockRejectedValueOnce(new Error('Offline'))
  render(<Frame home />)
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline')
  expect(screen.getAllByText('—')).toHaveLength(2)
  await userEvent.click(screen.getByRole('button', { name: 'Retry statistics' }))
  expect(await screen.findByText('0')).toBeInTheDocument()
})
it('clears Home data on a club change and ignores late responses', async () => {
  let resolve!: (value: { id: string }[]) => void
  mock.listActivities.mockReturnValueOnce(new Promise(done => { resolve = done }))
  const view = render(<Frame home />)
  view.rerender(<Frame home clubId="next" />)
  expect(await screen.findByRole('heading', { name: 'Next Club.' })).toBeInTheDocument()
  await screen.findByText('1')
  resolve([{ id: 'one' }, { id: 'two' }])
  expect(screen.queryByText('2')).not.toBeInTheDocument()
})

it('keeps Club active for invitation and evidence-package routes', () => {
  render(<Frame path="/evidence-package" />)
  const nav = screen.getByRole('navigation', { name: 'Main navigation' })
  expect(within(nav).getByRole('link', { name: 'Club' })).toHaveAttribute('aria-current', 'page')
  expect(within(nav).getByRole('link', { name: 'Home' })).not.toHaveAttribute('aria-current')
})
