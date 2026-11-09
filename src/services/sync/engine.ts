import { invalidateReadiness } from '../readiness-events'
import { db } from '../../db/offline'
import type { LocalActivity } from '../activities'
import { activityRow, cloudTransport, LoginRequired, type SyncTransport } from './transport'
export const MAX_AUTO_SYNC_ATTEMPTS = 5
export interface SyncScope { userId: string; clubId: string }
export interface SyncState { running: boolean; authRequired: boolean; error: string; revision: number }
export function createSyncEngine(transport: SyncTransport, database = db, now = Date.now, online = () => navigator.onLine) {
  let scope: SyncScope | null = null
  let generation = 0
  let flight: Promise<void> | null = null
  let state: SyncState = { running: false, authRequired: false, error: '', revision: 0 }
  const listeners = new Set<() => void>()
  function publish(patch: Partial<SyncState> = {}) { state = { ...state, ...patch, revision: state.revision + 1 }; listeners.forEach(listener => listener()) }
  function setScope(next: SyncScope | null) {
    if (scope?.userId === next?.userId && scope?.clubId === next?.clubId) return
    scope = next; generation++; publish({ authRequired: false, error: '' })
  }
  async function work(force: boolean, expected: number) {
    const owner = scope
    if (!owner || !online() || state.authRequired) return
    const current = () => generation === expected && online()
    const authenticate = async () => { if (!current()) throw new Error('Sync paused. Your activities are saved on this device.'); await transport.authenticate(owner.userId); if (!current()) throw new Error('Sync paused. Your activities are saved on this device.') }
    publish({ running: true, error: '' })
    try {
      const rows = await database.activities.where('[created_by+club_id]').equals([owner.userId, owner.clubId]).toArray()
      for (const candidate of rows) {
        if (!current() || state.authRequired) break
        if (candidate.sync_status === 'synced' || (!force && ((candidate.next_retry_at ?? 0) > now() || (candidate.attempt_count ?? 0) >= MAX_AUTO_SYNC_ATTEMPTS))) continue
        let activity: LocalActivity | undefined
        try {
          // Persist immutability before the first network request: a failed request
          // may already have committed remotely. Retrying must keep the same payload.
          activity = await database.transaction('rw', database.activities, async () => {
            const row = await database.activities.get(candidate.id)
            if (!row || row.sync_status === 'synced') return
            const patch = { sync_status: 'pending_sync' as const, sync_started_at: row.sync_started_at ?? now(), attempt_count: (row.attempt_count ?? 0) + 1, last_error: '' }
            await database.activities.update(row.id, patch)
            return { ...row, ...patch }
          })
          if (!activity) continue
          publish()
          await authenticate()
          await database.activities.update(activity.id, { sync_status: 'uploading' }); publish()
          const photos = await database.attachments.where('activity_id').equals(activity.id).toArray()
          for (const photo of photos) {
            if (!['image/jpeg', 'image/png'].includes(photo.blob.type)) throw new Error('This image format cannot be uploaded. Keep this record on your device.')
            await authenticate()
            await transport.upload(`${activity.club_id}/${activity.id}/${photo.id}.jpg`, photo)
          }
          await authenticate(); await transport.insertActivity(activityRow(activity))
          for (const photo of photos) {
            const metadata = { id: photo.id, activity_id: activity.id, storage_path: `${activity.club_id}/${activity.id}/${photo.id}.jpg`, mime_type: photo.blob.type, file_size: photo.blob.size }
            await authenticate(); await transport.insertAttachment(metadata)
            await authenticate(); const confirmed = await transport.readAttachment(photo.id)
            if (!confirmed || Object.entries(metadata).some(([key, value]) => confirmed[key as keyof typeof metadata] !== value)) throw new Error('Cloud image details differ. Your local copy is safe.')
          }
          await authenticate(); const confirmed = await transport.readActivity(activity.id)
          const payload = activityRow(activity)
          if (!confirmed || Object.entries(payload).some(([key, value]) => key === 'created_at' ? Date.parse(confirmed.created_at) !== Date.parse(String(value)) : confirmed[key as keyof typeof payload] !== value)) throw new Error('Cloud activity differs. Your local copy is safe.')
          if (!current()) throw new Error('Sync paused. Your activities are saved on this device.')
          await database.activities.update(activity.id, { sync_status: 'synced', last_error: '', next_retry_at: 0 })
          invalidateReadiness(owner.clubId)
          publish()
        } catch (failure) {
          const authRequired = failure instanceof LoginRequired
          const exhausted = (activity?.attempt_count ?? 0) >= MAX_AUTO_SYNC_ATTEMPTS
          const message = authRequired ? 'Sign in again to continue syncing. Your activities are safe on this device.' : failure instanceof Error && /differs|image format|Sync paused/.test(failure.message) ? failure.message : exhausted ? 'Sync failed after 5 automatic attempts. Your activity is safe on this device. Use Retry sync to try again.' : 'Could not sync. Your activity is safe on this device. We will retry when online.'
          if (activity) await database.activities.update(activity.id, { sync_status: 'failed', last_error: message, next_retry_at: now() + Math.min(300_000, 1000 * 2 ** Math.min((activity.attempt_count ?? 1) - 1, 9)) })
          if (generation === expected) publish({ error: message, authRequired })
          if (authRequired) break
        }
      }
    } catch { publish({ error: 'Unable to open local activities. Check browser storage and try again.' }) }
    finally { publish({ running: false }) }
  }
  function run(force = false): Promise<void> {
    if (flight) return flight
    const expected = generation
    flight = (async () => {
      if (typeof navigator.locks?.request === 'function') await navigator.locks.request('clubready-activity-sync', () => expected === generation ? work(force, expected) : Promise.resolve())
      else await work(force, expected)
    })().catch(() => { publish({ running: false, error: 'Sync could not start. Your local records are safe.' }) }).finally(() => {
      flight = null
      if (expected !== generation && scope && online()) void run()
    })
    return flight
  }
  return { setScope, run, getSnapshot: () => state, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }, resumeAuth() { publish({ authRequired: false, error: '' }) } }
}
export const syncEngine = createSyncEngine(cloudTransport)
