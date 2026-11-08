// Timers only run while the app is open. No Background Sync API is used.
export function startSyncTriggers(run: () => Promise<void>, target: Window = window, intervalMs = 30_000) {
  const trigger = () => { if (navigator.onLine) void run() }
  target.addEventListener('online', trigger)
  const timer = target.setInterval(trigger, intervalMs)
  trigger()
  return () => { target.removeEventListener('online', trigger); target.clearInterval(timer) }
}
