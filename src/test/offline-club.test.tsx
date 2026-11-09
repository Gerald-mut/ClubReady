import { render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ClubProvider } from '../contexts/ClubContext'
import { useClub } from '../hooks/useClub'
import { db } from '../db/offline'
import { loadMembership } from '../services/clubs'
vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({ session: { user: { id: 'cached-user' } } }) }))
vi.mock('../services/clubs', () => ({ loadMembership: vi.fn() }))
function Consumer() { const { selection, loading, error } = useClub(); return <p>{loading ? 'Loading' : error || selection?.club.name || 'No club'}</p> }
afterEach(async () => { Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }); await db.delete(); await db.open() })
it('restores the same account’s club offline without a membership request', async () => {
  await db.selections.put({ user_id: 'cached-user', selection: { club: { id: 'club', name: 'Offline club', county: 'Nairobi', sub_county: null, year_established: null, description: null, contact_email: null, created_at: '', updated_at: '' }, membership: { club_id: 'club', user_id: 'cached-user', role: 'club_member', joined_at: '' } } })
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  render(<ClubProvider><Consumer /></ClubProvider>)
  expect(await screen.findByText('Offline club')).toBeInTheDocument()
  expect(loadMembership).not.toHaveBeenCalled()
})
it('does not restore another account’s club', async () => {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
  render(<ClubProvider><Consumer /></ClubProvider>)
  expect(await screen.findByText('Open your club online once before using PlayProof offline.')).toBeInTheDocument()
  expect(loadMembership).not.toHaveBeenCalled()
})

it('restores only this account’s cached profile when online reporting masks a network failure', async () => {
  await db.selections.put({ user_id: 'cached-user', selection: { club: { id: 'club', name: 'Offline fallback club', county: 'Nairobi', sub_county: null, year_established: null, description: null, contact_email: null, created_at: '', updated_at: '' }, membership: { club_id: 'club', user_id: 'cached-user', role: 'club_member', joined_at: '' } } })
  vi.mocked(loadMembership).mockRejectedValueOnce(new TypeError('Failed to fetch'))
  render(<ClubProvider><Consumer /></ClubProvider>)
  expect(await screen.findByText('Offline fallback club')).toBeInTheDocument()
})
it('does not use cached membership to conceal a server permission denial', async () => {
  await db.selections.put({ user_id: 'cached-user', selection: { club: { id: 'club', name: 'Must remain hidden', county: 'Nairobi', sub_county: null, year_established: null, description: null, contact_email: null, created_at: '', updated_at: '' }, membership: { club_id: 'club', user_id: 'cached-user', role: 'club_member', joined_at: '' } } })
  vi.mocked(loadMembership).mockRejectedValueOnce(new Error('Permission denied'))
  render(<ClubProvider><Consumer /></ClubProvider>)
  expect(await screen.findByText('Permission denied')).toBeInTheDocument()
  expect(screen.queryByText('Must remain hidden')).not.toBeInTheDocument()
})

it('bounds a stalled membership request before restoring the offline profile', async () => {
  await db.selections.put({ user_id: 'cached-user', selection: { club: { id: 'club', name: 'Timeout fallback', county: 'Nairobi', sub_county: null, year_established: null, description: null, contact_email: null, created_at: '', updated_at: '' }, membership: { club_id: 'club', user_id: 'cached-user', role: 'club_member', joined_at: '' } } })
  vi.mocked(loadMembership).mockImplementationOnce((_user, _club, signal) => new Promise((_done, reject) => { signal?.addEventListener('abort', () => reject(new DOMException('Request aborted', 'AbortError'))) }))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  try {
    render(<ClubProvider><Consumer /></ClubProvider>)
    const { act } = await import('@testing-library/react')
    await act(async () => { await vi.advanceTimersByTimeAsync(8000) })
  } finally { vi.useRealTimers() }
  expect(await screen.findByText('Timeout fallback')).toBeInTheDocument()
})
