import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useClub } from '../hooks/useClub'
import { supabase } from '../services/supabase'

export default function RouteGuard({ setup = false }: { setup?: boolean }) {
  const auth = useAuth()
  const club = useClub()
  const location = useLocation()
  if (!supabase) return <p role="alert">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to continue.</p>
  if (auth.loading) return <p role="status">Restoring your session…</p>
  if (auth.error) return <p role="alert">{auth.error} <a href="/sign-in">Try signing in again</a></p>
  if (auth.recovery) return <Navigate to="/reset-password" replace />
  if (!auth.session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  if (club.loading) return <p role="status">Loading your club…</p>
  if (club.error) return <div role="alert"><p>{club.error}</p><button onClick={() => void club.refresh()}>Retry</button></div>
  if (!club.selection && !setup) return <Navigate to="/club-setup" replace />
  if (club.selection && setup) return <Navigate to="/club-profile" replace />
  return <Outlet />
}
