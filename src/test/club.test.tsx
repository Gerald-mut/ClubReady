import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'
import ClubForm from '../components/club/ClubForm'
import ClubProfile from '../pages/ClubProfile'
import ClubSetup from '../pages/club/ClubSetup'
import Documents from '../components/documents/Documents'
import { AuthContext } from '../contexts/auth-state'
import { ClubContext } from '../contexts/club-state'
import { ClubProvider } from '../contexts/ClubContext'
import { useClub } from '../hooks/useClub'
import type { Club, Evidence } from '../types/club'
const mock = vi.hoisted(() => ({ createClub: vi.fn(), updateClub: vi.fn(), loadMembership: vi.fn(), listDocuments: vi.fn(), uploadDocument: vi.fn(), deleteDocument: vi.fn(), documentUrl: vi.fn() }))
vi.mock('../services/clubs', () => ({ createClub: mock.createClub, updateClub: mock.updateClub, loadMembership: mock.loadMembership }))
vi.mock('../services/documents', () => ({ listDocuments: mock.listDocuments, uploadDocument: mock.uploadDocument, deleteDocument: mock.deleteDocument, documentUrl: mock.documentUrl }))
const club: Club = { id: 'club-a', name: 'Nairobi Stars', county: 'Nairobi', sub_county: 'Westlands', year_established: 2010, description: 'Grassroots football', contact_email: 'club@example.com', created_at: '', updated_at: '' }
const session = { user: { id: 'user-a' } } as Session
const auth = { session, loading: false, error: '', recovery: false, finishRecovery: vi.fn() }
const refresh = vi.fn()
function wrap(child: React.ReactNode, role: 'club_admin' | 'club_member' = 'club_admin') {
  return render(<AuthContext.Provider value={auth}><ClubContext.Provider value={{ selection: { club, membership: { club_id: club.id, user_id: 'user-a', role, joined_at: '' } }, error: '', loading: false, refresh }}>{child}</ClubContext.Provider></AuthContext.Provider>)
}
beforeEach(() => { Object.values(mock).forEach(fn => fn.mockReset()); mock.listDocuments.mockResolvedValue([]); refresh.mockReset() })
describe('club management', () => {
  it('creates a club without documents', async () => {
    mock.createClub.mockResolvedValue('club-a'); wrap(<ClubSetup />); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Club name (required)'), 'New Club'); await user.type(screen.getByLabelText('County (required)'), 'Kiambu'); await user.click(screen.getByRole('button', { name: 'Create club' }))
    expect(mock.createClub).toHaveBeenCalledWith({ name: 'New Club', county: 'Kiambu', sub_county: null, year_established: null, description: null, contact_email: null })
    expect(screen.getByRole('status')).toHaveTextContent('Club created'); expect(refresh).toHaveBeenCalled()
  })
  it('prevents empty required fields from submission', async () => {
    const save = vi.fn(); render(<ClubForm label="Save" onSave={save} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' })); expect(save).not.toHaveBeenCalled()
  })
  it('disables submission until saving completes', async () => {
    let finish!: () => void
    const save = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    render(<ClubForm initial={club} label="Save" onSave={save} />)
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Saving…' })); expect(save).toHaveBeenCalledTimes(1)
    finish(); await waitFor(() => expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled())
  })
  it('allows administrators to edit the club', async () => {
    mock.updateClub.mockResolvedValue(club); wrap(<ClubProfile />); const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Edit profile' })); const name = screen.getByLabelText('Club name (required)'); await user.clear(name); await user.type(name,'Updated Stars'); await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(mock.updateClub).toHaveBeenCalledWith('club-a', expect.objectContaining({ name: 'Updated Stars' })); expect(refresh).toHaveBeenCalled()
  })
  it('shows members a read-only profile', async () => {
    wrap(<ClubProfile />, 'club_member'); await screen.findByText('No documents supplied yet.')
    expect(screen.getByText('Nairobi Stars')).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Edit profile' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Upload document' })).not.toBeInTheDocument()
  })
  it('reports club save failures', async () => {
    mock.createClub.mockRejectedValue(new Error('Creation unavailable')); wrap(<ClubSetup />); const user = userEvent.setup()
    await user.type(screen.getByLabelText('Club name (required)'), 'Club'); await user.type(screen.getByLabelText('County (required)'), 'Nairobi'); await user.click(screen.getByRole('button', { name: 'Create club' })); expect(await screen.findByRole('alert')).toHaveTextContent('Creation unavailable')
  })
})
describe('document interface', () => {
  const document: Evidence = { id: 'doc-a', club_id: club.id, uploaded_by: 'user-a', file_name: 'policy.pdf', document_type: 'safeguarding_policy', storage_path: 'club-a/file.pdf', mime_type: 'application/pdf', file_size: 100, status: 'supplied', expires_at: null, uploaded_at: '' }
  it('uploads a selected file and category', async () => {
    render(<Documents clubId={club.id} userId="user-a" admin />); const user = userEvent.setup(); const file = new File(['pdf'], 'test.pdf', { type: 'application/pdf' })
    await user.upload(screen.getByLabelText(/File \(PDF/),file); await user.selectOptions(screen.getByLabelText('Document type'),'other'); fireEvent.submit(screen.getByRole('button', { name: 'Upload document' }).closest('form')!)
    await waitFor(() => expect(mock.uploadDocument).toHaveBeenCalled())
    expect(mock.uploadDocument).toHaveBeenCalledWith(club.id,'user-a','other',file); expect(await screen.findByText(/Document supplied\./)).toBeInTheDocument()
  })
  it('requires confirmation to delete a document', async () => {
    mock.listDocuments.mockResolvedValue([document]); render(<Documents clubId={club.id} userId="user-a" admin />)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' })); expect(mock.deleteDocument).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm delete' })); expect(mock.deleteDocument).toHaveBeenCalledWith(document)
  })
  it('cancels deletion and hides admin controls for members', async () => {
    mock.listDocuments.mockResolvedValue([document]); const view = render(<Documents clubId={club.id} userId="user-a" admin />)
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' })); await userEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(mock.deleteDocument).not.toHaveBeenCalled()
    view.rerender(<Documents clubId={club.id} userId="user-a" admin={false} />); expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument()
  })
  it('requests a signed URL only when asked to view', async () => {
    mock.listDocuments.mockResolvedValue([document]); mock.documentUrl.mockResolvedValue('https://example.com/signed'); render(<Documents clubId={club.id} userId="user-a" admin={false} />)
    await screen.findByText('policy.pdf'); expect(mock.documentUrl).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'View' })); expect(mock.documentUrl).toHaveBeenCalledWith(document,false); expect(await screen.findByRole('link', { name: 'Open policy.pdf' })).toHaveAttribute('href','https://example.com/signed')
  })
})
function MembershipProbe() { const { selection, loading, error } = useClub(); return <p>{loading ? 'Loading membership' : error || selection?.club.name || 'No club'}</p> }
it('loads membership and removes previous account data on account switching', async () => {
  mock.loadMembership.mockResolvedValue({ club, membership: { role: 'club_admin' } })
  const view = render(<AuthContext.Provider value={auth}><ClubProvider><MembershipProbe /></ClubProvider></AuthContext.Provider>)
  expect(await screen.findByText('Nairobi Stars')).toBeInTheDocument()
  mock.loadMembership.mockResolvedValue(null)
  view.rerender(<AuthContext.Provider value={{ ...auth, session: { user: { id: 'user-b' } } as Session }}><ClubProvider><MembershipProbe /></ClubProvider></AuthContext.Provider>)
  expect(screen.queryByText('Nairobi Stars')).not.toBeInTheDocument(); expect(await screen.findByText('No club')).toBeInTheDocument()
})
