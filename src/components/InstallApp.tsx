import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
const ios = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

export default function InstallApp() {
  const [installed, setInstalled] = useState(standalone)
  const [offer, setOffer] = useState<InstallEvent | null>(null)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const media = window.matchMedia?.('(display-mode: standalone)')
    const changed = () => setInstalled(standalone())
    const available = (event: Event) => { event.preventDefault(); setOffer(event as InstallEvent); setNotice('') }
    const complete = () => { setInstalled(true); setOffer(null) }
    window.addEventListener('beforeinstallprompt', available)
    window.addEventListener('appinstalled', complete)
    media?.addEventListener('change', changed)
    return () => { window.removeEventListener('beforeinstallprompt', available); window.removeEventListener('appinstalled', complete); media?.removeEventListener('change', changed) }
  }, [])
  if (installed) return null
  if (ios()) return <details className="text-sm text-muted"><summary className="cursor-pointer">Install ClubReady on iPhone or iPad</summary><p className="mt-2">In Safari, tap Share, then Add to Home Screen and Add. If needed, open this page in Safari first.</p></details>
  if (!offer && !notice) return null
  async function install() {
    if (!offer || busy) return
    const event = offer
    setBusy(true); setNotice('')
    try {
      await event.prompt()
      const choice = await event.userChoice
      setNotice(choice.outcome === 'accepted' ? 'Installation requested. Follow your browser’s instructions.' : 'You can install later from your browser menu.')
    } catch { setNotice('Installation is unavailable right now. Try your browser menu.') }
    finally { setOffer(null); setBusy(false) }
  }
  return <div className="text-sm text-muted">{offer && <button className="underline" disabled={busy} onClick={() => void install()}>{busy ? 'Opening installation…' : 'Install ClubReady'}</button>}{notice && <p role="status">{notice}</p>}</div>
}
