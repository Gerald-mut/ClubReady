import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { db } from '../db/offline'
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
  const [preferredClub, setPreferredClub] = useState<string>()
  const refresh = useCallback(async (clubId?: string) => { if (clubId) setPreferredClub(clubId); setVersion(value => value + 1) }, [])
  useEffect(() => {
    let active = true
    if (!userId) return
    const restore = async () => {
      if (!navigator.onLine) {
        const cached = await db.selections.get(userId)
        if (!cached) throw new Error('Open your club online once before using PlayProof offline.')
        return cached.selection
      }
      const selection = await loadMembership(userId, preferredClub)
      if (selection) await db.selections.put({ user_id: userId, selection })
      else await db.selections.delete(userId)
      return selection
    }
    void restore().then(selection => {
      if (active) setState({ version, selection, error: '' })
    }).catch(error => { if (active) setState({ version, selection: null, error: message(error) }) })
    return () => { active = false }
  }, [userId, version, preferredClub])
  const current = state.version === version
  return <ClubContext.Provider value={{ selection: state.selection, error: current ? state.error : '', loading: !!userId && !current && !state.selection, refresh }}>{children}</ClubContext.Provider>
}
