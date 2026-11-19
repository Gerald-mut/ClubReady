import { Link } from 'react-router-dom'
import { useSearchParams } from 'react-router-dom'
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
  const [params] = useSearchParams()
  const section = params.get('section') || 'overview'
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  if (!selection || !session) return null
  const { club, membership } = selection
  const admin = membership.role === 'club_admin'
  return <section className="panel mx-auto max-w-2xl">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="eyebrow">Club profile</p><h1 className="page-title mt-3 break-words">{club.name}</h1><p className="mt-3 text-sm text-muted">{club.county}{club.sub_county ? ` · ${club.sub_county}` : ''}</p></div>
      {section === 'overview' && admin && <button className="button button-secondary" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel editing' : 'Edit profile'}</button>}
    </div>
    <p className="mt-4 text-sm">Your role: <strong>{admin ? 'Club administrator' : 'Club member'}</strong></p>
    {notice && <p role="status" className="mt-4 text-sm text-ink">{notice}</p>}
    <nav className="mt-6 flex flex-wrap gap-2 border-b border-border" aria-label="Club sections">
      {['overview', 'members', 'documents', 'settings'].map(value => <Link key={value} className={`min-h-11 px-3 py-3 text-sm ${section === value ? 'border-b-2 border-current text-accent-readable' : 'text-muted'}`} aria-current={section === value ? 'page' : undefined} to={`?section=${value}`} onClick={() => { setEditing(false) }}>{value[0].toUpperCase() + value.slice(1)}</Link>)}
    </nav>
    {section === 'overview' && (editing && admin ? <ClubForm initial={club} label="Save changes" onSave={async input => { await updateClub(club.id, input); setEditing(false); setNotice('Club profile updated.'); await refresh() }} /> : <dl className="mt-6 grid gap-6 sm:grid-cols-2">
      <div><dt className="text-sm text-muted">Year established</dt><dd className="mt-1">{club.year_established || 'Not added'}</dd></div>
      <div><dt className="text-sm text-muted">Contact email</dt><dd className="mt-1 break-words">{club.contact_email || 'Not added'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-muted">About the club</dt><dd className="mt-1 whitespace-pre-wrap break-words">{club.description || 'No description added yet.'}</dd></div>
    </dl>)}
    {section === 'settings' && <div className="mt-6 space-y-4"><h2 className="text-xl font-semibold">Settings</h2><Link className="section-row" to="/join">Join a club</Link><Link className="section-row" to="/evidence-package">Evidence package</Link><Link className="section-row" to="/play-proof">Activity sync and PlayProof</Link></div>}
    {section === 'members' && <Members key={`members:${club.id}:${session.user.id}:${membership.role}`} clubId={club.id} userId={session.user.id} admin={admin} refresh={refresh} />}
    {section === 'documents' && <Documents key={`${club.id}:${session.user.id}:${membership.role}`} clubId={club.id} userId={session.user.id} admin={admin} />}
  </section>
}
