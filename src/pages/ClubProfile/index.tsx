import { Link } from 'react-router-dom'
import Icon from '../../components/Icons'
import { useState } from 'react'
import { useClub } from '../../hooks/useClub'
import { useAuth } from '../../hooks/useAuth'
import ClubForm from '../../components/club/ClubForm'
import Documents from '../../components/documents/Documents'
import Members from '../../components/members/Members'
import { updateClub } from '../../services/clubs'
export default function ClubProfile() {
  const { selection, refresh } = useClub()
  const { session } = useAuth()
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  if (!selection || !session) return null
  const { club, membership } = selection
  const admin = membership.role === 'club_admin'
  return <section className="panel mx-auto max-w-2xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Club profile</p><h1 className="page-title mt-3 break-words">{club.name}</h1><p className="mt-3 text-sm text-muted">{club.county}{club.sub_county ? ` · ${club.sub_county}` : ''}</p></div>
      {admin && <button className="button button-secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel editing' : 'Edit profile'}</button>}
    </div>
    <p className="mt-4 text-sm">Your role: <strong>{admin ? 'Club administrator' : 'Club member'}</strong></p>
    {notice && <p role="status" className="mt-4 text-sm text-ink">{notice}</p>}
    {editing && admin ? <ClubForm initial={club} label="Save changes" onSave={async input => { await updateClub(club.id, input); setEditing(false); setNotice('Club profile updated.'); await refresh() }} /> : <dl className="mt-6 grid gap-6 sm:grid-cols-2">
      <div><dt className="text-sm text-muted">Year established</dt><dd className="mt-1">{club.year_established || 'Not added'}</dd></div>
      <div><dt className="text-sm text-muted">Contact email</dt><dd className="mt-1 break-words">{club.contact_email || 'Not added'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted">About the club</dt><dd className="mt-1 whitespace-pre-wrap break-words">{club.description || 'No description added yet.'}</dd></div>
    </dl>}
    <nav className="mt-8" aria-label="Club sections">
      <a className="section-row" href="#club-members">Members &amp; invitations <Icon name="arrow" size={16} /></a>
      <a className="section-row" href="#club-documents">Documents <Icon name="arrow" size={16} /></a>
      <Link className="section-row" to="/join">Join a club <Icon name="arrow" size={16} /></Link>
      <Link className="section-row" to="/evidence-package">Evidence package <Icon name="arrow" size={16} /></Link>
    </nav>
    <Members key={`members:${club.id}:${session.user.id}:${membership.role}`} clubId={club.id} userId={session.user.id} admin={admin} refresh={refresh} />
    <Documents key={`${club.id}:${session.user.id}:${membership.role}`} clubId={club.id} userId={session.user.id} admin={admin} />
  </section>
}
