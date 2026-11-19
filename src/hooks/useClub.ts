import { useContext } from 'react'
import { ClubContext } from '../contexts/club-state'
export function useClub() {
  const value = useContext(ClubContext)
  if (!value) throw new Error('ClubProvider is required')
  return value
}
