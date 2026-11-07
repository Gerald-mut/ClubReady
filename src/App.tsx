import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import ClubProfile from './pages/ClubProfile'
import PlayProof from './pages/PlayProof'
import Opportunities from './pages/Opportunities'
import EvidencePackage from './pages/EvidencePackage'
import PwaStatus from './components/PwaStatus'
import AuthPage from './pages/auth/AuthPage'
import ClubSetup from './pages/club/ClubSetup'
import JoinClub from './pages/club/JoinClub'
import RouteGuard from './components/RouteGuard'
import { useAuth } from './hooks/useAuth'
import { backend, message } from './services/supabase'
import { useState } from 'react'

const navigation = [
  ['/club-profile', 'Club profile'], ['/play-proof', 'Play proof'],
  ['/opportunities', 'Opportunities'], ['/evidence-package', 'Evidence package'],
  ['/join', 'Join a club'],
]

export default function App() {
  const { session } = useAuth()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  async function signOut() {
    setBusy(true); setError('')
    try { const { error } = await backend().auth.signOut(); if (error) throw error }
    catch (failure) { setError(message(failure)) }
    finally { setBusy(false) }
  }
  return <>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <Link to="/" className="text-xl font-bold text-green-800">ClubReady <span className="text-slate-500">254</span></Link>
        <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">{session ? <><span className="break-all">{session.user.email}</span><button disabled={busy} className="text-green-800 underline" onClick={() => void signOut()}>{busy ? 'Signing out…' : 'Sign out'}</button></> : <Link to="/sign-in" className="text-green-800 underline">Sign in</Link>}</div>
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <nav aria-label="Main navigation" className="mt-5 flex flex-wrap gap-2">
          {navigation.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</NavLink>)}
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Routes>
        <Route path="/" element={<Navigate to="/club-profile" replace />} />
        <Route path="/join" element={<JoinClub key={session?.user.id || 'signed-out'} />} />
        <Route path="/join/:token" element={<JoinClub key={session?.user.id || 'signed-out'} />} />
        {(['sign-in', 'sign-up', 'forgot-password', 'reset-password'] as const).map(mode => <Route key={mode} path={`/${mode}`} element={<AuthPage key={mode} mode={mode} />} />)}
        <Route element={<RouteGuard setup />}><Route path="/club-setup" element={<ClubSetup />} /></Route>
        <Route element={<RouteGuard />}>
        <Route path="/club-profile" element={<ClubProfile />} />
        <Route path="/play-proof" element={<PlayProof />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/evidence-package" element={<EvidencePackage />} />
        </Route>
        <Route path="*" element={<section><h1 className="text-2xl font-bold">Page not found</h1><Link className="mt-4 inline-block text-green-800 underline" to="/">Return to ClubReady</Link></section>} />
      </Routes>
    </main>
    <PwaStatus />
  </>
}
