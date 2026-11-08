import { useState, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { backend, message } from '../services/supabase'
import Icon, { type IconName } from './Icons'
import PwaStatus from './PwaStatus'
import ActivitySync from './ActivitySync'
const navigation: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Home', icon: 'home' }, { to: '/play-proof', label: 'PlayProof', icon: 'ball' },
  { to: '/opportunities', label: 'Explore', icon: 'explore' }, { to: '/club-profile', label: 'Club', icon: 'club' },
]
function Navigation({ desktop = false }: { desktop?: boolean }) {
  const { pathname } = useLocation()
  return <nav className={desktop ? 'desktop-nav' : 'bottom-nav'} aria-label={desktop ? 'Desktop navigation' : 'Main navigation'}>{navigation.map(item => {
    const active = item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`) || item.to === '/club-profile' && ['/join', '/evidence-package', '/club-setup'].some(path => pathname.startsWith(path))
    return <Link key={item.to} className="nav-item" to={item.to} aria-current={active ? 'page' : undefined}><Icon name={item.icon} /><span>{item.label}</span></Link>
  })}</nav>
}
export default function AppShell({ children }: { children: ReactNode }) {
  const { session, recovery } = useAuth()
  const { pathname } = useLocation()
  const publicPage = recovery || ['/sign-in', '/sign-up', '/forgot-password', '/reset-password'].includes(pathname) || !session
  const [menu, setMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function signOut() {
    if (busy) return
    setBusy(true); setError('')
    try { const result = await backend().auth.signOut(); if (result.error) throw result.error; setMenu(false) }
    catch (failure) { setError(message(failure)) }
    finally { setBusy(false) }
  }
  return <>
    <header className="app-header"><div className="page-width header-content">
      <Link to="/" className="brand" aria-label="ClubReady 254 home"><span className="brand-mark"><Icon name="shield" size={24} /></span><span>clubready<span className="ml-1 text-xs font-medium tracking-normal text-muted">254</span></span></Link>
      {!publicPage && <Navigation desktop />}
      {!publicPage && <div className="relative" onKeyDown={event => { if (event.key === 'Escape') setMenu(false) }}><button className="profile-trigger" aria-label="Account menu" aria-expanded={menu} aria-controls="account-menu" onClick={() => setMenu(value => !value)}><Icon name="profile" /></button>{menu && <div className="account-menu" id="account-menu" onKeyDown={event => { if (event.key === 'Escape') setMenu(false) }}>
        <p className="mb-2 break-all text-xs text-muted">{session?.user.email}</p><Link className="section-row" to="/club-profile" onClick={() => setMenu(false)}>Club profile <Icon name="arrow" size={16} /></Link><Link className="section-row" to="/join" onClick={() => setMenu(false)}>Join a club <Icon name="arrow" size={16} /></Link><Link className="section-row" to="/evidence-package" onClick={() => setMenu(false)}>Evidence package <Icon name="arrow" size={16} /></Link><button disabled={busy} className="mt-2 w-full text-left text-sm" onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button>{error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      </div>}</div>}
    </div></header>
    <main className={`page-width ${publicPage ? 'public-main' : 'app-main'}`}>{children}{!publicPage && <details className="mx-auto mt-10 max-w-2xl border-t border-border pt-4"><summary className="cursor-pointer text-sm text-muted">Activity sync</summary><ActivitySync /></details>}</main>
    {!publicPage && <Navigation />}
    <PwaStatus />
  </>
}
