// No assessment data is cached. Successful source writes invalidate mounted readers.
const listeners = new Set<(clubId: string) => void>()
export function invalidateReadiness(clubId: string) {
  listeners.forEach(listener => {
    try { listener(clubId) } catch { /* A view must never turn a committed source write into a failed sync. */ }
  })
}
export function subscribeReadiness(listener: (clubId: string) => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
