import { useRef, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useClub } from '../../hooks/useClub'
import { acceptInvite } from '../../services/members'
import { inviteCode } from '../../services/invite-return'
import { message } from '../../services/supabase'
export default function JoinClub() {
  const { token } = useParams()
  const auth = useAuth()
  const club = useClub()
  const navigate = useNavigate()
  const [code, setCode] = useState(token || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [joined, setJoined] = useState(false)
  const lock = useRef(false)
  if (auth.loading) return <p role="status">Restoring your session…</p>
  if (auth.recovery) return <Navigate to="/reset-password" replace />
  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = inviteCode(code)
    if (!value) { setError('Enter a valid invite code or a link from this site.'); return }
    if (!auth.session) { navigate(`/sign-in?next=${encodeURIComponent(`/join/${value}`)}`); return }
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { const clubId = await acceptInvite(value); await club.refresh(clubId); setCode(''); setJoined(true) }
    catch (failure) { setError(message(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  return <section className="panel mx-auto max-w-xl"><h1 className="text-3xl font-bold">Join a club</h1>
    <p className="mt-3 text-slate-600">Paste an invitation from a club administrator. Invitations are single use and expire after seven days.</p>
    {auth.error && <p role="alert" className="mt-4 text-red-700">{auth.error}</p>}
    {error && <p role="alert" className="mt-4 text-red-700">{error}</p>}
    {joined ? <div className="mt-6"><p role="status">You have joined the club.</p><Link className="text-green-800 underline" to="/club-profile">View club profile</Link></div> : <form className="mt-6 space-y-4" onSubmit={event => void submit(event)}>
      <label className="field">Invite code or link<input value={code} onChange={event => setCode(event.target.value)} required autoComplete="off" spellCheck={false} maxLength={2048} /></label>
      <button className="button" disabled={busy}>{busy ? 'Joining…' : auth.session ? 'Join club' : 'Continue to sign in'}</button>
    </form>}
  </section>
}
