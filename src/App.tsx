import { lazy, Suspense } from 'react'
import { Route, Routes, Link } from 'react-router-dom'
import RouteGuard from './components/RouteGuard'
import { useAuth } from './hooks/useAuth'
import AppShell from './components/AppShell'
const ClubProfile = lazy(() => import('./pages/ClubProfile'))
const PlayProof = lazy(() => import('./pages/PlayProof'))
const Opportunities = lazy(() => import('./pages/Opportunities'))
const OpportunityDetail = lazy(() => import('./pages/Opportunities/Detail'))
const EvidencePackage = lazy(() => import('./pages/EvidencePackage'))
const AuthPage = lazy(() => import('./pages/auth/AuthPage'))
const ClubSetup = lazy(() => import('./pages/club/ClubSetup'))
const JoinClub = lazy(() => import('./pages/club/JoinClub'))
const Home = lazy(() => import('./pages/Home'))

export default function App() {
  const { session } = useAuth()
  return <AppShell>
      <Suspense fallback={<p role="status">Loading page…</p>}><Routes>
        <Route path="/join" element={<JoinClub key={session?.user.id || 'signed-out'} />} />
        <Route path="/join/:token" element={<JoinClub key={session?.user.id || 'signed-out'} />} />
        {(['sign-in', 'sign-up', 'forgot-password', 'reset-password'] as const).map(mode => <Route key={mode} path={`/${mode}`} element={<AuthPage key={mode} mode={mode} />} />)}
        <Route element={<RouteGuard setup />}><Route path="/club-setup" element={<ClubSetup />} /></Route>
        <Route element={<RouteGuard />}><Route path="/" element={<Home />} />
        <Route path="/club-profile" element={<ClubProfile />} />
        <Route path="/play-proof" element={<PlayProof />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/opportunities/:id" element={<OpportunityDetail />} />
        <Route path="/evidence-package" element={<EvidencePackage />} />
        </Route>
        <Route path="*" element={<section><h1 className="text-2xl font-bold">Page not found</h1><Link className="mt-4 inline-block text-accent-readable underline" to="/">Return to ClubReady</Link></section>} />
      </Routes></Suspense>
  </AppShell>
}
