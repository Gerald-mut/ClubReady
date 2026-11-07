import Dexie, { type EntityTable } from 'dexie'
import type { Activity, ClubProfile, Opportunity, PendingActivity } from '../types'

export const db = new Dexie('clubready-254') as Dexie & {
  clubs: EntityTable<ClubProfile, 'id'>
  activities: EntityTable<Activity, 'id'>
  opportunities: EntityTable<Opportunity, 'id'>
  pendingActivities: EntityTable<PendingActivity, 'id'>
}

db.version(1).stores({
  clubs: 'id, name, county',
  activities: 'id, clubId, occurredAt',
  opportunities: 'id, deadline',
  pendingActivities: 'id, &activityId, createdAt',
})

// Keep the activity and its outbox entry atomic when offline.
export async function saveActivity(activity: Activity): Promise<void> {
  await db.transaction('rw', db.activities, db.pendingActivities, async () => {
    await db.activities.put(activity)
    await db.pendingActivities.put({ id: activity.id, activityId: activity.id, createdAt: activity.createdAt })
  })
}
