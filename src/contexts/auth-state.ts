import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
interface AuthState {
  session: Session | null; loading: boolean; error: string; recovery: boolean
  finishRecovery: () => void
}
export const AuthContext = createContext<AuthState | null>(null)
