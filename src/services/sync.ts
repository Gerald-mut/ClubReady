import { db } from '../db/offline'
import { supabase } from './supabase'

// Explicitly invoked; wire to authentication and connectivity once the server exists.
export async function syncActivities(): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured.')
  if (!navigator.onLine) return 0
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Sign in before syncing activities.')
  const pending = await db.pendingActivities.orderBy('createdAt').toArray()
  let synced = 0
  for (const entry of pending) {
    const activity = await db.activities.get(entry.activityId)
    if (!activity) throw new Error(`Missing queued activity: ${entry.activityId}`)
    const { data, error } = await supabase.functions.invoke('sync-activity', { body: { activity } })
    if (error) throw error
    if (data?.activityId !== activity.id) throw new Error('Server did not acknowledge the activity.')
    await db.pendingActivities.delete(entry.id)
    synced++
  }
  return synced
}
