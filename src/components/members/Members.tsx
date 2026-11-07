import { useEffect, useRef, useState } from 'react'
import { createInvite, listInvites, listMembers, removeMember, revokeInvite, setMemberRole, type ClubInvite, type MemberRole } from '../../services/members'
import { message } from '../../services/supabase'
import type { Membership } from '../../types/club'
const roleName = (role: MemberRole) => role === 'club_admin' ? 'Club administrator' : 'Club member'
type Change = { userId: string; role: MemberRole | null }
export default function Members({ clubId, userId, admin, refresh }: { clubId: string; userId: string; admin: boolean; refresh: () => Promise<void> }) {
  const [members, setMembers] = useState<Membership[]>([])
  const [invites, setInvites] = useState<ClubInvite[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const [role, setRole] = useState<MemberRole>('club_member')
  const [link, setLink] = useState('')
  const [pending, setPending] = useState<Change | null>(null)
  const lock = useRef(false)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    let active = true
    void Promise.all([listMembers(clubId), admin ? listInvites(clubId) : Promise.resolve([])]).then(([people, codes]) => {
      if (active) { setMembers(people); setInvites(codes) }
    }).catch(failure => { if (active) setError(message(failure)) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [clubId, admin, version])
  async function action(work: () => Promise<void>) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try { await work() } catch (failure) { setError(message(failure)) }
    finally { lock.current = false; setBusy(false) }
  }
  function reload() { setLoading(true); setVersion(value => value + 1) }
  return <section className="mt-10 border-t border-slate-200 pt-6" aria-label="Members" aria-busy={loading || busy}>
    <h2 className="text-xl font-semibold">Members</h2>
    <p className="mt-2 text-sm text-slate-600">Members are identified by their account ID. Share invitations only with people you trust.</p>
    {error && <div role="alert" className="mt-4 text-red-700">{error} <button className="underline" disabled={busy} onClick={() => { setError(''); reload() }}>Reload members</button></div>}
    {notice && <p role="status" className="mt-4 text-green-800">{notice}</p>}
    {loading ? <p role="status">Loading members…</p> : <ul className="mt-4 divide-y divide-slate-200">{members.map(member => <li key={member.user_id} className="py-4">
      <p className="break-all font-medium">{member.user_id}{member.user_id === userId ? ' (you)' : ''}</p><p>{roleName(member.role)}</p>
      {admin && <div className="mt-2 flex flex-wrap gap-4"><button className="text-green-800 underline" disabled={busy} onClick={() => setPending({ userId: member.user_id, role: member.role === 'club_admin' ? 'club_member' : 'club_admin' })}>{member.role === 'club_admin' ? 'Demote to member' : 'Promote to administrator'}</button><button className="text-red-700 underline" disabled={busy} onClick={() => setPending({ userId: member.user_id, role: null })}>Remove member</button></div>}
    </li>)}</ul>}
    {pending && admin && <div role="group" aria-label="Confirm membership change" className="mt-4 rounded-lg border border-slate-200 p-4">
      <p className="break-words">{pending.role ? `Change ${pending.userId} to ${roleName(pending.role)}?` : `Remove ${pending.userId} from this club?`} The club must retain an administrator.</p>
      <div className="mt-3 flex gap-4"><button className="button" disabled={busy} onClick={() => void action(async () => {
        if (pending.role) await setMemberRole(clubId, pending.userId, pending.role)
        else await removeMember(clubId, pending.userId)
        const own = pending.userId === userId
        setPending(null); setNotice('Membership updated.'); reload()
        if (own) await refresh()
      })}>Confirm change</button><button disabled={busy} onClick={() => setPending(null)}>Cancel</button></div>
    </div>}
    {admin && <div className="mt-6 space-y-4">
      <h3 className="font-semibold">Invite someone</h3>
      <label className="field max-w-md">Invite role<select value={role} disabled={busy} onChange={event => setRole(event.target.value as MemberRole)}><option value="club_member">Club member</option><option value="club_admin">Club administrator</option></select></label>
      <button className="button" disabled={busy} onClick={() => void action(async () => {
        setLink(''); const token = await createInvite(clubId, role)
        setLink(`${window.location.origin}/join/${token}`); setNotice('Invite created. Copy it now; it cannot be retrieved later.'); reload()
      })}>{busy ? 'Please wait…' : 'Invite'}</button>
      {link && <div className="space-y-2"><label className="field">Invite link<input readOnly value={link} onFocus={event => event.target.select()} /></label><button className="text-green-800 underline" disabled={busy} onClick={() => void action(async () => { await navigator.clipboard.writeText(link); setNotice('Invite copied.') })}>Copy invite</button><p className="text-sm text-slate-600">Single use. Expires in seven days. Anyone with this link can join with the selected role.</p></div>}
      <h3 className="font-semibold">Invitations</h3>
      <ul className="divide-y divide-slate-200">{invites.map(invite => {
        const state = invite.revoked_at ? 'Revoked' : invite.used_at ? 'Used' : Date.parse(invite.expires_at) <= now ? 'Expired' : 'Available'
        return <li className="py-3" key={invite.id}><p>{roleName(invite.role)} · {state}</p><p className="text-sm">Expires {new Date(invite.expires_at).toLocaleString()}</p>{!invite.revoked_at && <button disabled={busy} className="text-red-700 underline" onClick={() => void action(async () => { await revokeInvite(invite.id); setLink(''); setNotice('Invite revoked.'); reload() })}>Revoke invite</button>}</li>
      })}</ul>
    </div>}
  </section>
}
