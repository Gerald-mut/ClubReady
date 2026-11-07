import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ClubContext } from './club-state'
import { useAuth } from '../hooks/useAuth'
import { loadMembership } from '../services/clubs'
import { message } from '../services/supabase'

type Selection = Awaited<ReturnType<typeof loadMembership>>

export function ClubProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth()
  return <ClubSession key={session?.user.id || 'signed-out'} userId={session?.user.id}>{children}</ClubSession>
}
function ClubSession({ children, userId }: { children: ReactNode; userId?: string }) {
  const [state, setState] = useState<{ version: number; selection: Selection; error: string }>({ version: -1, selection: null, error: '' })
  const [version, setVersion] = useState(0)
  const refresh = useCallback(async () => { setVersion(value => value + 1) }, [])
  useEffect(() => {
    let active = true
    if (!userId) return
    void loadMembership(userId).then(selection => {
      if (active) setState({ version, selection, error: '' })
    }).catch(error => { if (active) setState({ version, selection: null, error: message(error) }) })
    return () => { active = false }
  }, [userId, version])
  const current = state.version === version
  return <ClubContext.Provider value={{ selection: state.selection, error: current ? state.error : '', loading: !!userId && !current && !state.selection, refresh }}>{children}</ClubContext.Provider>
}
