import { useRegisterSW } from 'virtual:pwa-register/react'

export default function PwaStatus() {
  const { offlineReady: [offlineReady, setOfflineReady], needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()
  if (!offlineReady && !needRefresh) return null
  return <aside role="status" className="fixed right-4 bottom-4 left-4 rounded-xl border border-green-200 bg-white p-4 shadow-lg sm:left-auto sm:max-w-sm">
    <p>{needRefresh ? 'An app update is available.' : 'ClubReady is ready to open offline.'}</p>
    <div className="mt-3 flex gap-4">
      {needRefresh && <button className="font-semibold text-green-800" onClick={() => void updateServiceWorker(true)}>Update</button>}
      <button className="text-slate-600" onClick={() => { setOfflineReady(false); setNeedRefresh(false) }}>Dismiss</button>
    </div>
  </aside>
}
