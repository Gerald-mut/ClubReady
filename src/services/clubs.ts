import { backend } from './supabase'
import type { Club, ClubInput, Membership } from '../types/club'

export async function loadMembership(userId: string, clubId?: string): Promise<{ membership: Membership; club: Club } | null> {
  const client = backend()
  let query = client.from('club_members').select('*').eq('user_id', userId)
  if (clubId) query = query.eq('club_id', clubId)
  const { data, error } = await query.order('joined_at').order('club_id').limit(1)
  if (error) throw error
  const membership = data?.[0] as Membership | undefined
  if (!membership && clubId) return loadMembership(userId)
  if (!membership) return null
  const result = await client.from('clubs').select('*').eq('id', membership.club_id).single()
  if (result.error) throw result.error
  return { membership, club: result.data as Club }
}
export async function createClub(input: ClubInput) {
  const { data, error } = await backend().rpc('create_club', {
    p_name: input.name, p_county: input.county, p_sub_county: input.sub_county,
    p_year_established: input.year_established, p_description: input.description, p_contact_email: input.contact_email,
  })
  if (error) throw error
  return data as string
}
export async function updateClub(id: string, input: ClubInput) {
  const { data, error } = await backend().from('clubs').update(input).eq('id', id).select().single()
  if (error) throw error
  return data as Club
}
