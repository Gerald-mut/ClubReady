import { Route, Routes, Link } from 'react-router-dom'
import ClubProfile from './pages/ClubProfile'
import PlayProof from './pages/PlayProof'
import Opportunities from './pages/Opportunities'
import OpportunityDetail from './pages/Opportunities/Detail'
import EvidencePackage from './pages/EvidencePackage'
import AuthPage from './pages/auth/AuthPage'
import ClubSetup from './pages/club/ClubSetup'
import JoinClub from './pages/club/JoinClub'
import RouteGuard from './components/RouteGuard'
import { useAuth } from './hooks/useAuth'
import AppShell from './components/AppShell'
import Home from './pages/Home'

export default function App() {
  const { session } = useAuth()
  return <AppShell>
      <Routes>
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
      </Routes>
  </AppShell>
}
