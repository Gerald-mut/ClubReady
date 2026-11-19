import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { Blob as NodeBlob } from 'node:buffer'
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createLocalDatabase, db, deleteActivity, listActivities, saveActivity } from '../db/offline'
import { validateActivity, type ActivityInput } from '../services/activities'
import { ActivityRecorder } from '../pages/PlayProof'
const input: ActivityInput = { activity_type: 'training', title: 'Saturday practice', date: '2026-11-07', location: 'Club field', participants_count: 12, notes: 'Passing drills' }
afterEach(async () => { await db.delete(); await db.open() })
describe('local activity storage', () => {
  it('persists records and Blobs after reopening, with a stable UUID through edits', async () => {
    const attachment = { id: crypto.randomUUID(), activity_id: '', name: 'photo.jpg', blob: new NodeBlob(['photo'], { type: 'image/jpeg' }) as unknown as Blob }
    const activity = await saveActivity('user', 'club', input, [attachment])
    db.close(); await db.open()
    expect(await listActivities('user', 'club')).toEqual([activity])
    expect(activity.sync_status).toBe('saved_locally')
    expect((await db.attachments.get(attachment.id))?.blob.size).toBe(5)
    const updated = await saveActivity('user', 'club', { ...input, title: 'Updated' }, [attachment], activity.id)
    expect(updated.id).toBe(activity.id); expect(updated.createdAt).toBe(activity.createdAt)
    expect(await listActivities('other', 'club')).toEqual([])
    expect(await listActivities('user', 'other')).toEqual([])
    await expect(deleteActivity('other', 'club', activity.id)).rejects.toThrow()
    await deleteActivity('user', 'club', activity.id)
    expect(await db.attachments.count()).toBe(0)
  })
  it('rejects changes to synced/uploading records and invalid attachments', async () => {
    const row = await saveActivity('user', 'club', input)
    for (const sync_status of ['synced', 'uploading'] as const) {
      await db.activities.update(row.id, { sync_status })
      await expect(saveActivity('user', 'club', input, [], row.id)).rejects.toThrow()
      await expect(deleteActivity('user', 'club', row.id)).rejects.toThrow()
    }
    const oversized = { id: 'image', activity_id: '', name: 'photo', blob: new Blob([new Uint8Array(1024 * 1024 + 1)], { type: 'image/jpeg' }) }
    await expect(saveActivity('user', 'club', input, [oversized])).rejects.toThrow()
    expect(await db.activities.count()).toBe(1)
  })
  it('migrates v1 records without changing IDs and retires the outbox', async () => {
    const name = `migration-${crypto.randomUUID()}`
    const old = new Dexie(name)
    old.version(1).stores({ clubs: 'id, name, county', activities: 'id, clubId, occurredAt', opportunities: 'id, deadline', pendingActivities: 'id, &activityId, createdAt' })
    await old.table('activities').put({ id: 'stable-id', clubId: 'club', title: 'Legacy', occurredAt: '2026-11-07T10:00:00Z', createdAt: '2026-11-07T10:00:00Z' })
    old.close()
    const upgraded = createLocalDatabase(name)
    try {
      const row = await upgraded.activities.get('stable-id')
      expect(row).toMatchObject({ id: 'stable-id', club_id: 'club', created_by: '', date: '2026-11-07', sync_status: 'saved_locally' })
      expect(upgraded.tables.map(table => table.name)).not.toContain('pendingActivities')
    } finally { await upgraded.delete() }
  })
})
describe('activity validation', () => {
  it('rejects blank fields, impossible dates and fractional counts', () => {
    expect(validateActivity(input)).toBe('')
    for (const patch of [{ title: ' ' }, { location: '' }, { date: '2026-02-30' }, { participants_count: 0 }, { participants_count: 1.5 }, { participants_count: NaN }, { notes: 'x'.repeat(5001) }]) expect(validateActivity({ ...input, ...patch })).not.toBe('')
  })
  it('validates the form and saves offline, then restores history after remount', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    const view = render(<ActivityRecorder userId="user" clubId="club" />)
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a title')
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: input.title } })
    fireEvent.change(screen.getByLabelText('Date'), { target: { value: input.date } })
    fireEvent.change(screen.getByLabelText('Location'), { target: { value: input.location } })
    fireEvent.click(screen.getByRole('button', { name: 'Save locally' }))
    await screen.findByText('Saved locally')
    view.unmount(); db.close(); await db.open()
    render(<ActivityRecorder userId="user" clubId="club" />)
    await waitFor(() => expect(screen.getByText(input.title)).toBeInTheDocument())
    expect(screen.getByText('Saved locally')).toBeInTheDocument()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
  })
})
