import { useState } from 'react'
import { useClub } from '../../hooks/useClub'
import { useAuth } from '../../hooks/useAuth'
import ClubForm from '../../components/club/ClubForm'
import { updateClub } from '../../services/clubs'
export default function ClubProfile() {
  const { selection, refresh } = useClub()
  const { session } = useAuth()
  const [editing, setEditing] = useState(false)
  const [notice, setNotice] = useState('')
  if (!selection || !session) return null
  const { club, membership } = selection
  const admin = membership.role === 'club_admin'
  return <section className="panel">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm font-semibold text-green-800">Club profile</p><h1 className="mt-2 text-3xl font-bold break-words">{club.name}</h1><p className="mt-2 text-slate-600">{club.county}{club.sub_county ? ` · ${club.sub_county}` : ''}</p></div>
      {admin && <button className="button" onClick={() => setEditing(value => !value)}>{editing ? 'Cancel editing' : 'Edit profile'}</button>}
    </div>
    <p className="mt-4 text-sm">Your role: <strong>{admin ? 'Club administrator' : 'Club member'}</strong></p>
    {notice && <p role="status" className="mt-4 text-green-800">{notice}</p>}
    {editing && admin ? <ClubForm initial={club} label="Save changes" onSave={async input => { await updateClub(club.id, input); setEditing(false); setNotice('Club profile updated.'); await refresh() }} /> : <dl className="mt-6 grid gap-6 sm:grid-cols-2">
      <div><dt className="text-sm text-slate-500">Year established</dt><dd className="mt-1">{club.year_established || 'Not added'}</dd></div>
      <div><dt className="text-sm text-slate-500">Contact email</dt><dd className="mt-1 break-words">{club.contact_email || 'Not added'}</dd></div>
      <div className="sm:col-span-2"><dt className="text-sm text-slate-500">About the club</dt><dd className="mt-1 whitespace-pre-wrap break-words">{club.description || 'No description added yet.'}</dd></div>
    </dl>}
    <section className="mt-10 border-t border-slate-200 pt-6" aria-labelledby="club-documents-title">
      <h2 id="club-documents-title" className="text-xl font-semibold">Club documents</h2>
      <p className="mt-4 text-slate-600">No documents supplied yet.</p>
    </section>
  </section>
}
