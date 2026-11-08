import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useClub } from '../../hooks/useClub'
import { db, deleteActivity, editable, listActivities, saveActivity } from '../../db/offline'
import { activityTypes, compressImage, validateActivity, type ActivityInput, type Attachment, type LocalActivity } from '../../services/activities'
import { useSyncState } from '../../hooks/useSyncState'
import { syncEngine } from '../../services/sync'

const blank = (): ActivityInput => ({ activity_type: 'training', title: '', date: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10), location: '', participants_count: 1, notes: '' })
const labels = { saved_locally: 'Saved locally', pending_sync: 'Pending sync', uploading: 'Uploading', synced: 'Synced', failed: 'Failed - retry' }
function Photo({ attachment }: { attachment: Attachment }) {
  const element = useRef<HTMLImageElement>(null)
  useEffect(() => { const value = URL.createObjectURL(attachment.blob); if (element.current) element.current.src = value; return () => URL.revokeObjectURL(value) }, [attachment])
  return <img ref={element} alt={attachment.name} className="h-24 w-24 rounded object-cover" />
}
export function ActivityRecorder({ userId, clubId }: { userId: string; clubId: string }) {
  const [input, setInput] = useState(blank)
  const [id, setId] = useState<string>()
  const [activities, setActivities] = useState<LocalActivity[]>([])
  const [photos, setPhotos] = useState<Attachment[]>([])
  const [storedPhotos, setStoredPhotos] = useState<Attachment[]>([])
  const [online, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const sync = useSyncState()
  async function refresh() { const rows = await listActivities(userId, clubId); setActivities(rows); setStoredPhotos(await db.attachments.where('activity_id').anyOf(rows.map(row => row.id)).toArray()) }
  useEffect(() => {
    let active = true
    void listActivities(userId, clubId).then(async rows => { const attachments = await db.attachments.where('activity_id').anyOf(rows.map(row => row.id)).toArray(); if (active) { setActivities(rows); setStoredPhotos(attachments) } }).catch(() => { if (active) setError('Unable to open local storage. Check browser storage settings.') })
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update); window.addEventListener('offline', update)
    return () => { active = false; window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [userId, clubId, sync.revision])
  function reset() { setInput(blank()); setId(undefined); setPhotos([]) }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setNotice('')
    const invalid = validateActivity(input)
    if (invalid) { setError(invalid); return }
    setBusy(true)
    try { await saveActivity(userId, clubId, input, photos, id); reset(); await refresh(); setNotice('Saved locally on this device.'); if (navigator.onLine) void syncEngine.run() }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to save. Your form is still available; check device storage.') }
    finally { setBusy(false) }
  }
  const field = 'form-control'
  return <section className="mx-auto max-w-2xl space-y-6">
    <div><h1 className="page-title">PlayProof</h1><p role="status" className="mt-3 text-sm text-muted">{online ? 'Online · Activities sync automatically' : 'Offline · Activities will sync when you reconnect'}. Local copies stay on this device.</p><p className="text-sm text-muted">Open this app online once to prepare offline access. Clearing browser data removes local records.</p></div>
    {error && <p role="alert" className="text-ink">{error}</p>}{notice && <p role="status">{notice}</p>}
    <form onSubmit={event => void submit(event)} noValidate className="card space-y-5">
      <h2 className="text-xl font-semibold">{id ? 'Edit activity' : 'Record activity'}</h2>
      <fieldset disabled={busy} className="space-y-4">
      <label className="field">Activity type<select className={field} value={input.activity_type} onChange={e => setInput({ ...input, activity_type: e.target.value as ActivityInput['activity_type'] })}>{activityTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>
      <label className="field">Title<input className={field} required maxLength={150} value={input.title} onChange={e => setInput({ ...input, title: e.target.value })} /></label>
      <label className="field">Date<input className={field} type="date" required value={input.date} onChange={e => setInput({ ...input, date: e.target.value })} /></label>
      <label className="field">Location<input className={field} required maxLength={200} value={input.location} onChange={e => setInput({ ...input, location: e.target.value })} /></label>
      <label className="field">Participants<input className={field} type="number" min={1} step={1} required value={Number.isNaN(input.participants_count) ? '' : input.participants_count} onChange={e => setInput({ ...input, participants_count: e.target.valueAsNumber })} /></label>
      <label className="field">Notes<textarea className={field} maxLength={5000} value={input.notes} onChange={e => setInput({ ...input, notes: e.target.value })} /></label>
      <label className="field">Images (optional, up to 3; compressed to 1 MiB each)<input className={field} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={async e => {
        const files = Array.from(e.target.files ?? []); e.target.value = ''; setError('')
        if (photos.length + files.length > 3) { setError('Use at most 3 images.'); return }
        setBusy(true)
        try { const added = await Promise.all(files.map(async file => ({ id: crypto.randomUUID(), activity_id: id ?? '', name: file.name, blob: await compressImage(file) }))); setPhotos(previous => [...previous, ...added]) }
        catch (failure) { setError(failure instanceof Error ? failure.message : 'Unable to prepare images.') }
        finally { setBusy(false) }
      }} /></label>
      <div className="flex flex-wrap gap-3">{photos.map(photo => <div key={photo.id}><Photo attachment={photo} /><button type="button" onClick={() => setPhotos(photos.filter(item => item.id !== photo.id))}>Remove {photo.name}</button></div>)}</div>
      <button className="button" type="submit">{busy ? 'Saving…' : 'Save locally'}</button>
      {id && <button type="button" className="ml-4 underline" onClick={reset}>Cancel edit</button>}
      </fieldset>
    </form>
    <h2 className="text-xl font-semibold">Activity history</h2>
    {!activities.length && <p>No activities recorded yet.</p>}
    <ul className="space-y-4">{activities.map(activity => <li key={activity.id} className="space-y-2 rounded-xl border border-border p-4">
      <span className="inline-block rounded-full bg-canvas px-3 py-1 text-sm">{labels[activity.sync_status]}</span>
      {activity.last_error && <p className="text-ink">{activity.last_error}</p>}
      {activity.sync_status === 'failed' && <button className="underline disabled:opacity-50" disabled={!online || sync.running || sync.authRequired} onClick={() => void syncEngine.run(true)}>Retry sync</button>}
      {activity.sync_started_at !== undefined && activity.sync_status !== 'synced' && <p className="text-sm text-muted">Sync has started. This record is kept unchanged so it can be retried safely.</p>}
      <h3 className="font-semibold">{activity.title}</h3><p>{activity.date} · {activity.activity_type} · {activity.location}</p><p>{activity.participants_count} participants</p><p className="whitespace-pre-wrap break-words">{activity.notes}</p>
      <div className="flex flex-wrap gap-2">{storedPhotos.filter(photo => photo.activity_id === activity.id).map(photo => <Photo key={photo.id} attachment={photo} />)}</div>
      {editable(activity) && <div className="flex gap-6"><button disabled={busy} className="underline" onClick={() => { setId(activity.id); setInput(activity); setPhotos(storedPhotos.filter(photo => photo.activity_id === activity.id)); setError(''); setNotice('') }}>Edit</button><button disabled={busy} className="text-ink underline" onClick={async () => {
        if (!window.confirm('Delete this activity and its images from this device?')) return
        setBusy(true); setError('')
        try { await deleteActivity(userId, clubId, activity.id); if (id === activity.id) reset(); await refresh() } catch { setError('Unable to delete activity.') } finally { setBusy(false) }
      }}>Delete</button></div>}
    </li>)}</ul>
  </section>
}
export default function PlayProof() {
  const { session } = useAuth(); const { selection } = useClub()
  if (!session || !selection) return null
  return <ActivityRecorder key={`${session.user.id}:${selection.club.id}`} userId={session.user.id} clubId={selection.club.id} />
}
