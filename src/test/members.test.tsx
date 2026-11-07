import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import Members from '../components/members/Members'
import JoinClub from '../pages/club/JoinClub'
import AuthPage from '../pages/auth/AuthPage'
import { AuthContext } from '../contexts/auth-state'
import { ClubContext } from '../contexts/club-state'
import { inviteReturn } from '../services/invite-return'
const mock = vi.hoisted(() => ({ listMembers: vi.fn(), listInvites: vi.fn(), createInvite: vi.fn(), revokeInvite: vi.fn(), setMemberRole: vi.fn(), removeMember: vi.fn(), acceptInvite: vi.fn(), signInWithPassword: vi.fn(), signUp: vi.fn() }))
vi.mock('../services/members', () => mock)
vi.mock('../services/supabase', () => ({ backend: () => ({ auth: mock }), message: (error: Error) => error.message }))
const token = 'a'.repeat(64)
const session = { user: { id: 'admin-a' } } as Session
const auth = { session, loading: false, error: '', recovery: false, finishRecovery: vi.fn() }
const refresh = vi.fn()
const people = [
  { club_id: 'club-a', user_id: 'admin-a', role: 'club_admin', joined_at: '' },
  { club_id: 'club-a', user_id: 'member-b', role: 'club_member', joined_at: '' },
]
beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset()); refresh.mockReset()
  mock.listMembers.mockResolvedValue(people); mock.listInvites.mockResolvedValue([])
  mock.createInvite.mockResolvedValue(token); mock.acceptInvite.mockResolvedValue('club-a')
  refresh.mockResolvedValue(undefined)
})
function members(admin = true) { return render(<Members clubId="club-a" userId="admin-a" admin={admin} refresh={refresh} />) }
function flow(path = '/join', signedIn = true, loading = false) {
  return render(<AuthContext.Provider value={{ ...auth, session: signedIn ? session : null, loading }}><ClubContext.Provider value={{ selection: null, loading: false, error: '', refresh }}><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/join" element={<JoinClub />} /><Route path="/join/:token" element={<JoinClub />} />
    <Route path="/sign-in" element={<AuthPage mode="sign-in" />} /><Route path="/sign-up" element={<AuthPage mode="sign-up" />} />
    <Route path="/club-profile" element={<p>Profile destination</p>} />
  </Routes></MemoryRouter></ClubContext.Provider></AuthContext.Provider>)
}
it('lists roles read-only for members and never loads invites', async () => {
  members(false)
  expect(screen.getByRole('status')).toHaveTextContent('Loading members')
  expect(await screen.findByText('member-b')).toBeInTheDocument()
  expect(screen.getByText('Club administrator')).toBeInTheDocument(); expect(screen.getByText('Club member')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Invite' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Remove member' })).not.toBeInTheDocument()
  expect(mock.listInvites).not.toHaveBeenCalled()
})
it('creates an invite with the chosen role and copies its one-time link', async () => {
  const user = userEvent.setup(); members(); await screen.findByText('member-b')
  await user.selectOptions(screen.getByLabelText('Invite role'), 'club_admin')
  await user.click(screen.getByRole('button', { name: 'Invite' }))
  expect(mock.createInvite).toHaveBeenCalledWith('club-a', 'club_admin')
  expect(await screen.findByLabelText('Invite link')).toHaveValue(`${window.location.origin}/join/${token}`)
  await user.click(screen.getByRole('button', { name: 'Copy invite' }))
  expect(await screen.findByRole('status')).toHaveTextContent('Invite copied')
  expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/join/${token}`)
})
it('revokes listed invitations', async () => {
  mock.listInvites.mockResolvedValue([{ id: 'invite-a', role: 'club_member', expires_at: '2099-01-01', used_at: null, revoked_at: null }])
  members(); await userEvent.click(await screen.findByRole('button', { name: 'Revoke invite' }))
  expect(mock.revokeInvite).toHaveBeenCalledWith('invite-a')
  expect(await screen.findByRole('status')).toHaveTextContent('Invite revoked')
})
it('requires confirmation for role changes and removal', async () => {
  const user = userEvent.setup(); members(); await screen.findByText('member-b')
  await user.click(screen.getByRole('button', { name: 'Promote to administrator' }))
  expect(mock.setMemberRole).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Cancel' })); expect(mock.setMemberRole).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Promote to administrator' }))
  await user.click(screen.getByRole('button', { name: 'Confirm change' }))
  expect(mock.setMemberRole).toHaveBeenCalledWith('club-a', 'member-b', 'club_admin')
  await waitFor(() => expect(screen.queryByRole('group')).not.toBeInTheDocument())
  const row = screen.getByText('member-b').closest('li')!
  await user.click(within(row).getByRole('button', { name: 'Remove member' }))
  expect(mock.removeMember).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm change' }))
  expect(mock.removeMember).toHaveBeenCalledWith('club-a', 'member-b')
})
it('preserves last-admin errors and refreshes auth membership after a successful own change', async () => {
  mock.setMemberRole.mockRejectedValueOnce(new Error('Cannot demote the last administrator'))
  const user = userEvent.setup(); members(); await screen.findByText('member-b')
  await user.click(screen.getByRole('button', { name: 'Demote to member' }))
  await user.click(screen.getByRole('button', { name: 'Confirm change' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('last administrator')
  expect(refresh).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Confirm change' }))
  await waitFor(() => expect(refresh).toHaveBeenCalled())
})
it('retries failed loading and reports failed invite creation', async () => {
  mock.listMembers.mockRejectedValueOnce(new Error('Network unavailable')); mock.createInvite.mockRejectedValue(new Error('Invite denied'))
  const user = userEvent.setup(); members()
  expect(await screen.findByRole('alert')).toHaveTextContent('Network unavailable')
  await user.click(screen.getByRole('button', { name: 'Reload members' })); await screen.findByText('member-b')
  await user.click(screen.getByRole('button', { name: 'Invite' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invite denied')
  expect(screen.queryByLabelText('Invite link')).not.toBeInTheDocument()
})
it('joins from a token link, refreshes the joined club and shows success', async () => {
  flow(`/join/${token}`)
  expect(mock.acceptInvite).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Join club' }))
  expect(mock.acceptInvite).toHaveBeenCalledWith(token)
  expect(refresh).toHaveBeenCalledWith('club-a')
  expect(await screen.findByRole('status')).toHaveTextContent('You have joined')
  expect(screen.getByRole('link', { name: 'View club profile' })).toHaveAttribute('href', '/club-profile')
})
it('accepts pasted same-site links and rejects invalid codes before sending', async () => {
  const user = userEvent.setup(); flow()
  await user.type(screen.getByLabelText('Invite code or link'), 'invalid')
  await user.click(screen.getByRole('button', { name: 'Join club' }))
  expect(screen.getByRole('alert')).toHaveTextContent('valid invite code')
  expect(mock.acceptInvite).not.toHaveBeenCalled()
  await user.clear(screen.getByLabelText('Invite code or link'))
  await user.type(screen.getByLabelText('Invite code or link'), `${window.location.origin}/join/${token}`)
  await user.click(screen.getByRole('button', { name: 'Join club' }))
  expect(mock.acceptInvite).toHaveBeenCalledWith(token)
})
it('shows expired/revoked invite errors and permits retry', async () => {
  mock.acceptInvite.mockRejectedValueOnce(new Error('Invalid or unavailable invite'))
  const user = userEvent.setup(); flow(`/join/${token}`)
  await user.click(screen.getByRole('button', { name: 'Join club' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('Invalid or unavailable invite')
  expect(refresh).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'Join club' }))
  expect(await screen.findByRole('status')).toHaveTextContent('You have joined')
})
it('preserves the invite through sign-in without a redirect loop', async () => {
  mock.signInWithPassword.mockResolvedValue({ error: null })
  const user = userEvent.setup(); flow(`/join/${token}`, false)
  await user.click(screen.getByRole('button', { name: 'Continue to sign in' }))
  await user.type(screen.getByLabelText('Email'), 'coach@example.com'); await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Sign in' }))
  expect(await screen.findByLabelText('Invite code or link')).toHaveValue(token)
  expect(mock.acceptInvite).not.toHaveBeenCalled()
})
it('preserves invite context in sign-up confirmation redirects', async () => {
  mock.signUp.mockResolvedValue({ error: null, data: { session: null } })
  const user = userEvent.setup(); flow(`/sign-in?next=${encodeURIComponent(`/join/${token}`)}`, false)
  await user.click(screen.getByRole('link', { name: 'Create account' }))
  await user.type(screen.getByLabelText('Email'), 'coach@example.com'); await user.type(screen.getByLabelText('Password'), 'password123')
  await user.click(screen.getByRole('button', { name: 'Create your account' }))
  expect(mock.signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: `${window.location.origin}/sign-in?next=${encodeURIComponent(`/join/${token}`)}` } }))
  expect(await screen.findByRole('status')).toHaveTextContent('Check your email')
})
it('returns an already signed-in user from auth directly to the invite even without membership', async () => {
  flow(`/sign-up?next=${encodeURIComponent(`/join/${token}`)}`)
  expect(await screen.findByLabelText('Invite code or link')).toHaveValue(token)
})
it.each(['https://evil.example', '//evil.example', '/sign-in', '/join/invalid', '/join?next=/sign-in'])('rejects unsafe auth return destination %s', value => {
  expect(inviteReturn(`?next=${encodeURIComponent(value)}`)).toBeNull()
})
it('waits for authentication restoration on join routes', () => { flow(`/join/${token}`, false, true); expect(screen.getByRole('status')).toHaveTextContent('Restoring your session') })
it('disables join submission while acceptance is pending', async () => {
  let finish!: (clubId: string) => void
  mock.acceptInvite.mockReturnValue(new Promise<string>(resolve => { finish = resolve }))
  const user = userEvent.setup(); flow(`/join/${token}`)
  await user.click(screen.getByRole('button', { name: 'Join club' }))
  expect(screen.getByRole('button', { name: 'Joining…' })).toBeDisabled()
  await user.click(screen.getByRole('button', { name: 'Joining…' }))
  expect(mock.acceptInvite).toHaveBeenCalledTimes(1)
  finish('club-a')
  expect(await screen.findByRole('status')).toHaveTextContent('You have joined')
})
