import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaStatus() {
  const { offlineReady: [offlineReady, setOfflineReady], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  if (!offlineReady && !needRefresh) return null
  return <aside role="status" className="pwa-notice">
    <p>{needRefresh ? 'An app update is available.' : 'ClubReady is ready to open offline.'}</p>
    <div className="mt-3 flex gap-4">
      {needRefresh && <button className="font-semibold text-accent-readable" onClick={() => void updateServiceWorker(true)}>Update</button>}
      <button className="text-muted" onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}>Dismiss</button>
    </div>
  </aside>
}
