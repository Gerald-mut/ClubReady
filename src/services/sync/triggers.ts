// Timers only run while the app is open. No Background Sync API is used.
export function startSyncTriggers(run: () => Promise<void>, target: Window = window, intervalMs = 30_000) {
  const trigger = () => { if (navigator.onLine) void run() }
  const visible = () => { if (target.document.visibilityState === 'visible') trigger() }
  target.addEventListener('online', trigger)
  target.document.addEventListener('visibilitychange', visible)
  const timer = target.setInterval(trigger, intervalMs)
  trigger()
  return () => { target.removeEventListener('online', trigger); target.document.removeEventListener('visibilitychange', visible); target.clearInterval(timer) }
}
