import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useClub } from '../hooks/useClub'
import { syncEngine } from '../services/sync'
import { useSyncState } from '../hooks/useSyncState'
import { startSyncTriggers } from '../services/sync/triggers'
export default function ActivitySync() {
  const { session } = useAuth()
  const { selection } = useClub()
  const userId = session?.user.id, clubId = selection?.club.id, token = session?.access_token
  const state = useSyncState()
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    syncEngine.setScope(userId && clubId ? { userId, clubId } : null)
    if (!userId || !clubId) return
    syncEngine.resumeAuth()
    const stop = startSyncTriggers(() => syncEngine.run())
    return () => { stop(); syncEngine.setScope(null) }
  }, [userId, clubId, token])
  if (!userId || !clubId) return null
  return <aside aria-label="Activity sync" className="mt-4 space-y-2 text-sm">
    <p role="status">{!online ? 'Offline · Activities saved on this device' : state.authRequired ? 'Sync paused · Sign in again' : state.running ? 'Syncing activities…' : 'Activity sync ready · Local copies are kept'}</p>
    {state.error && <p role="alert" className="text-ink">{state.error}</p>}
    {state.authRequired ? <Link className="text-accent-readable underline" to="/sign-in?reauth=1">Sign in again</Link> : <button disabled={!online || state.running} className="text-accent-readable underline disabled:opacity-50" onClick={() => void syncEngine.run(true)}>Sync now</button>}
  </aside>
}
