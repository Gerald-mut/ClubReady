import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useSyncState } from '../hooks/useSyncState'

export default function PwaStatus() {
  const registration = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const [prepared, setPrepared] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const [error, setError] = useState('')
  const sync = useSyncState()
  const { offlineReady: [offlineReady], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW: (_url, value) => { registration.current = value; setPrepared(!!value?.active) },
    onRegisterError: () => setError('Offline setup is unavailable. Reopen online to try again.'),
  })
  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.getRegistration().then(value => setPrepared(!!value?.active)).catch(() => {})
    const check = () => {
      setOnline(navigator.onLine)
      if (navigator.onLine && document.visibilityState === 'visible') void registration.current?.update().catch(() => {})
    }
    window.addEventListener('online', check); window.addEventListener('offline', check)
    document.addEventListener('visibilitychange', check)
    const timer = window.setInterval(check, 60 * 60 * 1000)
    return () => { window.removeEventListener('online', check); window.removeEventListener('offline', check); document.removeEventListener('visibilitychange', check); window.clearInterval(timer) }
  }, [])
  async function update() {
    if (!online || sync.running || !window.confirm('Save any open forms in every ClubReady tab before updating. The app will reload. Saved local activities and images will be kept. Continue?')) return
    try { await updateServiceWorker(true) }
    catch { setError('The update could not be applied. Try again when online.') }
  }
  return <aside aria-label="App availability" className="space-y-2 text-sm text-muted">
    <p role="status">{!online ? 'You’re offline. Saved activities remain on this device. Use PlayProof to record more; documents and readiness need a connection.' : offlineReady || prepared ? 'App ready offline. Keep this device’s browser data to retain local activities.' : error || 'Open online to prepare offline access.'}</p>
    {needRefresh && <div><p>An app update is available. Save your work before updating.</p><div className="flex gap-4"><button className="text-accent-readable underline" disabled={!online || sync.running} onClick={() => void update()}>Update app</button><button onClick={() => setNeedRefresh(false)}>Later</button></div></div>}
    {error && (offlineReady || prepared) && <p role="status">{error}</p>}
  </aside>
}
