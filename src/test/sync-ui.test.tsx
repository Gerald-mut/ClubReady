import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import ActivitySync from '../components/ActivitySync'
import { ActivityRecorder } from '../pages/PlayProof'
import { AuthContext } from '../contexts/auth-state'
import { ClubContext } from '../contexts/club-state'
import { db, saveActivity } from '../db/offline'
const mock = vi.hoisted(() => ({ state: { running: false, authRequired: false, error: '', revision: 0 }, listeners: new Set<() => void>(), run: vi.fn(async () => {}), setScope: vi.fn(), resumeAuth: vi.fn() }))
vi.mock('../services/sync', () => ({ syncEngine: { run: mock.run, setScope: mock.setScope, resumeAuth: mock.resumeAuth, getSnapshot: () => mock.state, subscribe: (listener: () => void) => { mock.listeners.add(listener); return () => { mock.listeners.delete(listener) } } } }))
function publish(patch: Partial<typeof mock.state>) { act(() => { mock.state = { ...mock.state, ...patch, revision: mock.state.revision + 1 }; mock.listeners.forEach(listener => listener()) }) }
beforeEach(() => { mock.run.mockClear(); mock.state = { running: false, authRequired: false, error: '', revision: 0 }; Object.defineProperty(navigator, 'onLine', { configurable: true, value: true }) })
afterEach(async () => { await db.delete(); await db.open() })
it('shows global progress, disables concurrent manual sync and prompts re-login', () => {
  render(<MemoryRouter><AuthContext.Provider value={{ session: { user: { id: 'user' }, access_token: 'token' } as Session, loading: false, recovery: false, error: '', finishRecovery: vi.fn() }}><ClubContext.Provider value={{ selection: { club: { id: 'club' }, membership: {} } as never, loading: false, error: '', refresh: vi.fn() }}><ActivitySync /></ClubContext.Provider></AuthContext.Provider></MemoryRouter>)
  expect(mock.setScope).toHaveBeenCalledWith({ userId: 'user', clubId: 'club' })
  fireEvent.click(screen.getByRole('button', { name: 'Sync now' })); expect(mock.run).toHaveBeenCalledWith(true)
  publish({ running: true }); expect(screen.getByText('Syncing activities…')).toBeInTheDocument(); expect(screen.getByRole('button')).toBeDisabled()
  publish({ running: false, authRequired: true, error: 'Sign in again. Local records are safe.' })
  expect(screen.getByRole('alert')).toHaveTextContent('Local records are safe')
  expect(screen.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/sign-in?reauth=1')
})
it('refreshes badges after sync, retains failed records and offers retry', async () => {
  const activity = await saveActivity('user','club',{ activity_type: 'training', title: 'Practice', date: '2026-11-08', location: 'Field', participants_count: 10, notes: '' })
  render(<ActivityRecorder userId="user" clubId="club" />)
  await screen.findByText('Saved locally')
  await db.activities.update(activity.id, { sync_status: 'failed', sync_started_at: 1, last_error: 'Your local activity is safe.' })
  publish({})
  await screen.findByText('Failed - retry')
  expect(screen.getByText('Your local activity is safe.')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry sync' })); expect(mock.run).toHaveBeenCalledWith(true)
  await db.activities.update(activity.id, { sync_status: 'synced', last_error: '' }); publish({})
  await waitFor(() => expect(screen.getByText('Synced')).toBeInTheDocument())
  expect(await db.activities.count()).toBe(1)
})
