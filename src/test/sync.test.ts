import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalDatabase, db, deleteActivity, saveActivity } from '../db/offline'
import { createSyncEngine } from '../services/sync'
import { LoginRequired, type CloudActivity, type CloudAttachment, type SyncTransport } from '../services/sync/transport'
import { startSyncTriggers } from '../services/sync/triggers'
const input = { activity_type: 'training' as const, title: 'Practice', date: '2026-11-08', location: 'Field', participants_count: 10, notes: '' }
const scope = { userId: 'user-a', clubId: 'club-a' }
let online = true
let clock = 1000
function server() {
  const rows = new Map<string, CloudActivity>(), photos = new Map<string, CloudAttachment>(), uploads = new Map<string, Blob>()
  const calls: string[] = []
  const transport = {
    authenticate: vi.fn(async () => {}),
    upload: vi.fn(async (path, photo) => { calls.push('upload'); if (!uploads.has(path)) uploads.set(path, photo.blob) }),
    insertActivity: vi.fn(async row => { calls.push('insert'); if (!rows.has(row.id)) rows.set(row.id, row) }),
    readActivity: vi.fn(async id => { calls.push('read'); return rows.get(id)! }),
    insertAttachment: vi.fn(async row => { calls.push('attachment'); if (!photos.has(row.id)) photos.set(row.id, row) }),
    readAttachment: vi.fn(async id => photos.get(id)!),
  } satisfies SyncTransport
  const engine = createSyncEngine(transport, db, () => clock, () => online)
  engine.setScope(scope)
  return { engine, transport, rows, photos, uploads, calls }
}
async function seed(photo = false) {
  return saveActivity(scope.userId, scope.clubId, input, photo ? [{ id: crypto.randomUUID(), activity_id: '', name: 'photo.jpg', blob: new NodeBlob(['photo'], { type: 'image/jpeg' }) as unknown as Blob }] : [])
}
beforeEach(() => { online = true; clock = 1000 })
afterEach(async () => { vi.useRealTimers(); await db.delete(); await db.open() })
describe('activity sync engine', () => {
  it('retries an accepted write with a lost response and confirms exactly one row', async () => {
    const local = await seed(), cloud = server()
    cloud.transport.insertActivity.mockImplementationOnce(async row => { cloud.rows.set(row.id, row); throw new Error('connection lost after commit') })
    await cloud.engine.run()
    expect(await db.activities.get(local.id)).toMatchObject({ sync_status: 'failed', attempt_count: 1, next_retry_at: 2000 })
    await cloud.engine.run() // backoff is persisted, not bypassed by automatic triggers
    expect(cloud.transport.insertActivity).toHaveBeenCalledTimes(1)
    clock = 2000; await cloud.engine.run()
    expect(cloud.rows.size).toBe(1)
    expect(await db.activities.get(local.id)).toMatchObject({ id: local.id, sync_status: 'synced', attempt_count: 2, last_error: '' })
    expect(cloud.rows.get(local.id)?.created_at).toBe(local.createdAt)
  })
  it('resumes after upload succeeds but row insert fails, preserving blobs offline', async () => {
    const local = await seed(true), cloud = server()
    cloud.transport.insertActivity.mockRejectedValueOnce(new Error('network'))
    await cloud.engine.run()
    expect(cloud.uploads.size).toBe(1); expect(cloud.rows.size).toBe(0)
    await expect(saveActivity(scope.userId, scope.clubId, { ...input, title: 'Changed' }, [], local.id)).rejects.toThrow()
    await expect(deleteActivity(scope.userId, scope.clubId, local.id)).rejects.toThrow()
    await cloud.engine.run(true)
    expect(cloud.uploads.size).toBe(1); expect(cloud.rows.size).toBe(1); expect(cloud.photos.size).toBe(1)
    expect(cloud.calls).toEqual(['upload', 'upload', 'insert', 'attachment', 'read'])
    expect(cloud.transport.insertActivity).toHaveBeenCalledTimes(2)
    db.close(); await db.open()
    expect((await db.activities.get(local.id))?.sync_status).toBe('synced')
    expect(await db.attachments.count()).toBe(1)
  })
  it('retains an interrupted upload and retries it after a long offline absence', async () => {
    const local = await seed(true), cloud = server()
    cloud.transport.insertActivity.mockRejectedValueOnce(new Error('interrupted before metadata'))
    await cloud.engine.run()
    const [path, bytes] = [...cloud.uploads.entries()][0]
    expect(cloud.rows.size).toBe(0)
    // No server activity or attachment proves abandonment: retries have no TTL.
    clock += 365 * 24 * 60 * 60 * 1000
    db.close(); await db.open()
    await cloud.engine.run()
    expect(cloud.uploads.get(path)).toBe(bytes)
    expect(cloud.uploads.size).toBe(1)
    expect(cloud.photos.size).toBe(1)
    expect((await db.activities.get(local.id))?.sync_status).toBe('synced')
  })
  it('preserves an uploaded object while its metadata retry is still in backoff', async () => {
    const local = await seed(true), cloud = server()
    cloud.transport.insertAttachment.mockRejectedValueOnce(new Error('metadata unavailable'))
    await cloud.engine.run()
    const [path, bytes] = [...cloud.uploads.entries()][0]
    expect(cloud.rows.size).toBe(1)
    expect(cloud.photos.size).toBe(0)
    await cloud.engine.run()
    expect(cloud.transport.upload).toHaveBeenCalledTimes(1)
    expect(cloud.uploads.get(path)).toBe(bytes)
    clock = 2000
    await cloud.engine.run()
    expect(cloud.uploads.get(path)).toBe(bytes)
    expect((await db.activities.get(local.id))?.sync_status).toBe('synced')
  })
  it('recovers an uploading record after restart and retries attachment metadata failures', async () => {
    const local = await seed(true), cloud = server()
    await db.activities.update(local.id, { sync_status: 'uploading', sync_started_at: 1 })
    cloud.transport.insertAttachment.mockRejectedValueOnce(new Error('metadata failed'))
    await cloud.engine.run()
    expect((await db.activities.get(local.id))?.sync_status).toBe('failed')
    await cloud.engine.run(true)
    expect(cloud.rows.size).toBe(1); expect(cloud.photos.size).toBe(1)
    expect((await db.activities.get(local.id))?.sync_status).toBe('synced')
  })
  it('shares one flight across concurrent triggers', async () => {
    await seed(); const cloud = server()
    let release!: () => void
    cloud.transport.insertActivity.mockImplementationOnce(row => new Promise<void>(resolve => { release = () => { cloud.rows.set(row.id, row); resolve() } }))
    const a = cloud.engine.run(), b = cloud.engine.run(true)
    expect(a).toBe(b)
    await vi.waitFor(() => expect(release).toBeDefined())
    release(); await Promise.all([a, b])
    expect(cloud.transport.insertActivity).toHaveBeenCalledTimes(1)
  })
  it('pauses on auth expiry mid-sync and resumes only after authentication', async () => {
    const local = await seed(true), cloud = server()
    cloud.transport.insertActivity.mockRejectedValueOnce(new LoginRequired())
    await cloud.engine.run()
    expect(cloud.engine.getSnapshot().authRequired).toBe(true)
    expect((await db.activities.get(local.id))?.last_error).toContain('Sign in again')
    await cloud.engine.run(true)
    expect(cloud.transport.insertActivity).toHaveBeenCalledTimes(1)
    cloud.engine.resumeAuth(); await cloud.engine.run(true)
    expect(cloud.uploads.size).toBe(1); expect((await db.activities.get(local.id))?.sync_status).toBe('synced')
  })
  it('never confirms mismatching server data or syncs another account or club', async () => {
    const local = await seed(), cloud = server()
    await saveActivity('other', scope.clubId, input); await saveActivity(scope.userId, 'other', input)
    cloud.transport.readActivity.mockImplementation(async id => ({ ...cloud.rows.get(id)!, title: 'Different' }))
    await cloud.engine.run()
    expect(cloud.rows.size).toBe(1)
    expect((await db.activities.get(local.id))?.sync_status).toBe('failed')
    expect(await db.activities.where('sync_status').equals('saved_locally').count()).toBe(2)
  })
  it('stops later network operations when the account changes during an upload', async () => {
    const local = await seed(true), cloud = server()
    cloud.transport.upload.mockImplementationOnce(async () => { cloud.engine.setScope({ userId: 'other', clubId: 'other' }) })
    await cloud.engine.run()
    await cloud.engine.run()
    expect(cloud.transport.insertActivity).not.toHaveBeenCalled()
    expect((await db.activities.get(local.id))?.sync_status).toBe('failed')
  })
  it('syncs on offline-to-online, uses the open-app interval and removes triggers', async () => {
    const local = await seed(), cloud = server()
    online = false
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
    const stop = startSyncTriggers(() => cloud.engine.run(), window, 20)
    expect(cloud.rows.size).toBe(0)
    online = true; window.dispatchEvent(new Event('online'))
    await vi.waitFor(async () => expect((await db.activities.get(local.id))?.sync_status).toBe('synced'))
    const second = await seed()
    await vi.waitFor(async () => expect((await db.activities.get(second.id))?.sync_status).toBe('synced'))
    stop()
    await seed(); window.dispatchEvent(new Event('online'))
    await new Promise(resolve => setTimeout(resolve, 40))
    expect(cloud.rows.size).toBe(2)
  })
  it('upgrades version 2 while preserving UUIDs and image blobs', async () => {
    const name = `sync-migration-${crypto.randomUUID()}`
    const Dexie = (await import('dexie')).default
    const old = new Dexie(name)
    old.version(2).stores({ clubs: 'id, name, county', activities: 'id, [created_by+club_id], date, sync_status', opportunities: 'id, deadline', attachments: 'id, activity_id', selections: 'user_id' })
    await old.table('activities').put({ ...input, id: 'stable', created_by: 'user-a', club_id: 'club-a', createdAt: '2026-11-08T00:00:00Z', sync_status: 'uploading' })
    await old.table('attachments').put({ id: 'image', activity_id: 'stable', blob: new NodeBlob(['photo']) })
    old.close()
    const upgraded = createLocalDatabase(name)
    try {
      expect(await upgraded.activities.get('stable')).toMatchObject({ id: 'stable', sync_status: 'pending_sync', attempt_count: 0, last_error: '' })
      expect((await upgraded.attachments.get('image'))?.blob.size).toBe(5)
    } finally { await upgraded.delete() }
  })
})
