// Cloud synchronization is deliberately disabled in local-only Phase 4.
export async function syncActivities(): Promise<number> {
  throw new Error('Cloud sync is not available. Activities remain saved on this device.')
}
