import { createContext } from 'react'
import type { loadMembership } from '../services/clubs'
type Selection = Awaited<ReturnType<typeof loadMembership>>
interface State { selection: Selection; loading: boolean; error: string; refresh: () => Promise<void> }
export const ClubContext = createContext<State | null>(null)
