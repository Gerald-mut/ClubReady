import { NavLink, Navigate, Route, Routes, Link } from 'react-router-dom'
import ClubProfile from './pages/ClubProfile'
import PlayProof from './pages/PlayProof'
import Opportunities from './pages/Opportunities'
import EvidencePackage from './pages/EvidencePackage'
import PwaStatus from './components/PwaStatus'

const navigation = [
  ['/club-profile', 'Club profile'], ['/play-proof', 'Play proof'],
  ['/opportunities', 'Opportunities'], ['/evidence-package', 'Evidence package'],
]

export default function App() {
  return <>
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-8">
        <Link to="/" className="text-xl font-bold text-green-800">ClubReady <span className="text-slate-500">254</span></Link>
        <nav aria-label="Main navigation" className="mt-5 flex flex-wrap gap-2">
          {navigation.map(([to, label]) => <NavLink key={to} to={to} className={({ isActive }) => `rounded-lg px-4 py-2 text-sm font-medium ${isActive ? 'bg-green-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>{label}</NavLink>)}
        </nav>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <Routes>
        <Route path="/" element={<Navigate to="/club-profile" replace />} />
        <Route path="/club-profile" element={<ClubProfile />} />
        <Route path="/play-proof" element={<PlayProof />} />
        <Route path="/opportunities" element={<Opportunities />} />
        <Route path="/evidence-package" element={<EvidencePackage />} />
        <Route path="*" element={<section><h1 className="text-2xl font-bold">Page not found</h1><Link className="mt-4 inline-block text-green-800 underline" to="/">Return to ClubReady</Link></section>} />
      </Routes>
    </main>
    <PwaStatus />
  </>
}
