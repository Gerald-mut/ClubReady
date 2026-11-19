import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AuthContext } from './auth-state'
import type { Session } from '@supabase/supabase-js'
import { db } from '../db/offline'
import { message, supabase } from '../services/supabase'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [error, setError] = useState('')
  const [recovery, setRecovery] = useState(() => window.location.hash.includes('type=recovery'))
  const revision = useRef(0)
  const currentUser = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (!supabase) return
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      revision.current++
      if (!active) return
      const previousUser = currentUser.current
      currentUser.current = next?.user.id
      // Clear the offline profile on sign-out/account changes, retaining every
      // activity and attachment so pending work can resume for its owner.
      if (previousUser && previousUser !== next?.user.id) void db.selections.delete(previousUser).catch(() => {})
      setSession(next); setLoading(false); setError('')
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_OUT') setRecovery(false)
    })
    const initialRevision = revision.current
    void supabase.auth.getSession().then(({ data, error: failure }) => {
      if (!active || revision.current !== initialRevision) return
      if (failure) setError(message(failure))
      currentUser.current = data.session?.user.id
      setSession(data.session); setLoading(false)
    }).catch(failure => { if (active && revision.current === initialRevision) { setError(message(failure)); setLoading(false) } })
    return () => { active = false; subscription.unsubscribe() }
  }, [])
  return <AuthContext.Provider value={{ session, loading, error, recovery, finishRecovery: () => setRecovery(false) }}>{children}</AuthContext.Provider>
}
