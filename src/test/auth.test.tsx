import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import AuthPage from '../pages/auth/AuthPage'
import { AuthProvider } from '../contexts/AuthContext'
import { AuthContext } from '../contexts/auth-state'
import { useAuth } from '../hooks/useAuth'
import RouteGuard from '../components/RouteGuard'
import { ClubContext } from '../contexts/club-state'
const mock = vi.hoisted(() => ({
  auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), resetPasswordForEmail: vi.fn(), updateUser: vi.fn(), getSession: vi.fn(), onAuthStateChange: vi.fn() },
  unsubscribe: vi.fn(), listener: undefined as undefined | ((event: string, session: unknown) => void),
}))
vi.mock('../services/supabase', () => ({ supabase: { auth: mock.auth }, backend: () => ({ auth: mock.auth }), message: (e: { message: string }) => e.message }))
const session = { user: { id: 'user-a' } } as Session
const state = { session: null, loading: false, error: '', recovery: false, finishRecovery: vi.fn() }
function page(mode: 'sign-in' | 'sign-up' | 'forgot-password' | 'reset-password', value = {} ) {
  return render(<AuthContext.Provider value={{ ...state, ...value }}><MemoryRouter><Routes><Route path="/" element={<AuthPage mode={mode} />} /><Route path="/club-profile" element={<p>Club destination</p>} /><Route path="/reset-password" element={<p>Recovery destination</p>} /></Routes></MemoryRouter></AuthContext.Provider>)
}
beforeEach(() => {
  Object.values(mock.auth).forEach(fn => fn.mockReset())
  mock.auth.onAuthStateChange.mockImplementation(callback => { mock.listener = callback; return { data: { subscription: { unsubscribe: mock.unsubscribe } } } })
  mock.auth.getSession.mockResolvedValue({ data: { session }, error: null })
})
describe('authentication pages', () => {
  it('signs in with email and password', async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ error: null })
    page('sign-in'); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'coach@example.com')
    await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(mock.auth.signInWithPassword).toHaveBeenCalledWith({ email: 'coach@example.com', password: 'password123' })
    expect(await screen.findByText('Club destination')).toBeInTheDocument()
  })
  it('shows email confirmation instructions after signup', async () => {
    mock.auth.signUp.mockResolvedValue({ data: { session: null }, error: null })
    page('sign-up'); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'coach@example.com'); await user.type(screen.getByLabelText('Password'), 'password123')
    await user.click(screen.getByRole('button', { name: 'Create your account' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
    expect(mock.auth.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}/sign-in` } }))
  })
  it('shows authentication errors', async () => {
    mock.auth.signInWithPassword.mockResolvedValue({ error: { message: 'Invalid login credentials' } })
    page('sign-in'); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'coach@example.com'); await user.type(screen.getByLabelText('Password'), 'password123'); await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid login credentials')
  })
  it('requests a password reset on the recovery route', async () => {
    mock.auth.resetPasswordForEmail.mockResolvedValue({ error: null })
    page('forgot-password'); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Email'), 'coach@example.com'); await user.click(screen.getByRole('button', { name: 'Forgot password' }))
    expect(mock.auth.resetPasswordForEmail).toHaveBeenCalledWith('coach@example.com', { redirectTo: `${window.location.origin}/reset-password` })
    expect(await screen.findByRole('status')).toHaveTextContent('If an account exists')
  })
  it('keeps the reset form available to a recovery session and changes password', async () => {
    mock.auth.updateUser.mockResolvedValue({ error: null })
    page('reset-password', { session, recovery: true }); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Password', { exact: true }), 'newpassword123'); await user.type(screen.getByLabelText('Confirm password'), 'newpassword123'); await user.click(screen.getByRole('button', { name: 'Set a new password' }))
    expect(mock.auth.updateUser).toHaveBeenCalledWith({ password: 'newpassword123' })
    expect(await screen.findByRole('status')).toHaveTextContent('password has been updated')
  })
  it('rejects mismatched reset passwords', async () => {
    page('reset-password', { session }); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Password', { exact: true }), 'newpassword123'); await user.type(screen.getByLabelText('Confirm password'), 'different123'); await user.click(screen.getByRole('button', { name: 'Set a new password' }))
    expect(screen.getByRole('alert')).toHaveTextContent('do not match'); expect(mock.auth.updateUser).not.toHaveBeenCalled()
  })
  it('redirects recovery events away from sign in', () => { page('sign-in', { session, recovery: true }); expect(screen.getByText('Recovery destination')).toBeInTheDocument() })
})
function Probe() { const auth = useAuth(); return <p>{auth.loading ? 'restoring' : auth.session ? 'authenticated' : auth.error || 'signed out'}{auth.recovery ? ' recovery' : ''}</p> }
describe('session provider', () => {
  it('restores a persisted session and processes signout', async () => {
    const view = render(<AuthProvider><Probe /></AuthProvider>)
    expect(await screen.findByText('authenticated')).toBeInTheDocument()
    act(() => mock.listener?.('SIGNED_OUT', null))
    expect(screen.getByText('signed out')).toBeInTheDocument()
    view.unmount(); expect(mock.unsubscribe).toHaveBeenCalled()
  })
  it('does not overwrite an auth event with a stale session restoration', async () => {
    let resolve!: (value: unknown) => void
    mock.auth.getSession.mockReturnValue(new Promise(done => { resolve = done }))
    render(<AuthProvider><Probe /></AuthProvider>)
    act(() => mock.listener?.('PASSWORD_RECOVERY', session))
    await act(async () => resolve({ data: { session: null }, error: null }))
    expect(screen.getByText('authenticated recovery')).toBeInTheDocument()
  })
  it('surfaces session restoration errors', async () => {
    mock.auth.getSession.mockResolvedValue({ data: { session: null }, error: { message: 'Session expired' } })
    render(<AuthProvider><Probe /></AuthProvider>)
    expect(await screen.findByText('Session expired')).toBeInTheDocument()
  })
  it('ignores a late restoration rejection after a recovery event', async () => {
    let reject!: (reason: Error) => void
    function ErrorProbe() { return <p>{useAuth().error || 'No auth error'}</p> }
    mock.auth.getSession.mockReturnValue(new Promise((_, fail) => { reject = fail }))
    render(<AuthProvider><Probe /><ErrorProbe /></AuthProvider>)
    act(() => mock.listener?.('PASSWORD_RECOVERY', session))
    await act(async () => reject(new Error('Stale network failure')))
    expect(screen.getByText('authenticated recovery')).toBeInTheDocument()
    expect(screen.getByText('No auth error')).toBeInTheDocument()
  })
})
describe('protected routes', () => {
  const club = { selection: null, loading: false, error: '', refresh: vi.fn() }
  function guard(auth = {}, membership = {}, setup = false) {
    render(<AuthContext.Provider value={{ ...state, ...auth }}><ClubContext.Provider value={{ ...club, ...membership }}><MemoryRouter initialEntries={['/protected']}><Routes><Route element={<RouteGuard setup={setup} />}><Route path="/protected" element={<p>Protected content</p>} /></Route><Route path="/sign-in" element={<p>Sign in destination</p>} /><Route path="/club-setup" element={<p>Setup destination</p>} /><Route path="/reset-password" element={<p>Recovery destination</p>} /><Route path="/club-profile" element={<p>Profile destination</p>} /></Routes></MemoryRouter></ClubContext.Provider></AuthContext.Provider>)
  }
  it('redirects anonymous users', async () => { guard(); expect(await screen.findByText('Sign in destination')).toBeInTheDocument() })
  it('waits for restoration', () => { guard({ loading: true }); expect(screen.getByRole('status')).toHaveTextContent('Restoring') })
  it('redirects users without a club to setup', async () => { guard({ session }); expect(await screen.findByText('Setup destination')).toBeInTheDocument() })
  it('allows setup for users without a club', () => { guard({ session }, {}, true); expect(screen.getByText('Protected content')).toBeInTheDocument() })
  it('allows members into protected pages', () => { guard({ session }, { selection: { club: {}, membership: {} } }); expect(screen.getByText('Protected content')).toBeInTheDocument() })
  it('redirects existing members away from setup', () => { guard({ session }, { selection: { club: {}, membership: {} } }, true); expect(screen.getByText('Profile destination')).toBeInTheDocument() })
  it('preserves recovery flow', () => { guard({ session, recovery: true }); expect(screen.getByText('Recovery destination')).toBeInTheDocument() })
  it('shows membership failure instead of redirecting to setup', async () => { guard({ session }, { error: 'Network unavailable' }); await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable')) })
})
