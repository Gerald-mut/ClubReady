import Dexie, { type EntityTable } from 'dexie'
import type { ClubProfile, Opportunity } from '../types'
import { MAX_IMAGE_BYTES, validateActivity, type Attachment, type ActivityInput, type LocalActivity } from '../services/activities'
import type { Club, Membership } from '../types/club'
export interface CachedSelection { user_id: string; selection: { membership: Membership; club: Club } }
export const LOCAL_SCHEMA_VERSION = 2
export function createLocalDatabase(name = 'clubready-254') {
  const database = new Dexie(name) as Dexie & {
    clubs: EntityTable<ClubProfile, 'id'>; activities: EntityTable<LocalActivity, 'id'>
    opportunities: EntityTable<Opportunity, 'id'>; attachments: EntityTable<Attachment, 'id'>
    selections: EntityTable<CachedSelection, 'user_id'>
  }
  database.version(1).stores({ clubs: 'id, name, county', activities: 'id, clubId, occurredAt', opportunities: 'id, deadline', pendingActivities: 'id, &activityId, createdAt' })
  database.version(2).stores({ activities: 'id, [created_by+club_id], date, sync_status', attachments: 'id, activity_id', selections: 'user_id', pendingActivities: null }).upgrade(async transaction => {
    await transaction.table('activities').toCollection().modify(activity => {
      activity.club_id = activity.club_id ?? activity.clubId
      activity.created_by = activity.created_by ?? ''
      activity.date = activity.date ?? activity.occurredAt?.slice(0, 10) ?? ''
      activity.activity_type = activity.activity_type ?? 'other'
      activity.location = activity.location ?? ''; activity.notes = activity.notes ?? ''
      activity.participants_count = activity.participants_count ?? 1
      activity.sync_status = activity.sync_status ?? 'saved_locally'
      delete activity.clubId; delete activity.occurredAt
    })
  })
  return database
}
export const db = createLocalDatabase()
export async function listActivities(userId: string, clubId: string) {
  return (await db.activities.where('[created_by+club_id]').equals([userId, clubId]).toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
}
export function editable(activity: LocalActivity) { return activity.sync_status !== 'synced' && activity.sync_status !== 'uploading' }
export async function saveActivity(userId: string, clubId: string, input: ActivityInput, attachments: Attachment[] = [], id?: string) {
  const error = validateActivity(input)
  if (error) throw new Error(error)
  if (!userId || !clubId) throw new Error('Select a signed-in club first.')
  if (attachments.length > 3 || attachments.some(item => item.blob.size > MAX_IMAGE_BYTES || !['image/jpeg', 'image/png', 'image/webp'].includes(item.blob.type))) throw new Error('Use at most 3 images, each up to 1 MiB.')
  return db.transaction('rw', db.activities, db.attachments, async () => {
    const previous = id ? await db.activities.get(id) : undefined
    if (id && (!previous || previous.created_by !== userId || previous.club_id !== clubId || !editable(previous))) throw new Error('This activity cannot be edited.')
    const activity: LocalActivity = { ...input, title: input.title.trim(), location: input.location.trim(), id: previous?.id ?? crypto.randomUUID(), created_by: userId, club_id: clubId, createdAt: previous?.createdAt ?? new Date().toISOString(), sync_status: 'saved_locally' }
    await db.activities.put(activity)
    await db.attachments.where('activity_id').equals(activity.id).delete()
    await db.attachments.bulkAdd(attachments.map(item => ({ ...item, activity_id: activity.id })))
    return activity
  })
}
export async function deleteActivity(userId: string, clubId: string, id: string) {
  await db.transaction('rw', db.activities, db.attachments, async () => {
    const activity = await db.activities.get(id)
    if (!activity || activity.created_by !== userId || activity.club_id !== clubId || !editable(activity)) throw new Error('This activity cannot be deleted.')
    await db.attachments.where('activity_id').equals(id).delete()
    await db.activities.delete(id)
  })
}
