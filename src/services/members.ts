import { backend } from './supabase'
import type { Membership } from '../types/club'
export type MemberRole = Membership['role']
export interface ClubInvite {
  id: string; club_id: string; role: MemberRole; created_by: string
  expires_at: string; max_uses: number; used_at: string | null; revoked_at: string | null
}
export async function listMembers(clubId: string) {
  const { data, error } = await backend().from('club_members').select('*').eq('club_id', clubId).order('joined_at')
  if (error) throw error
  return data as Membership[]
}
export async function listInvites(clubId: string) {
  const { data, error } = await backend().from('club_invites')
    .select('id,club_id,role,created_by,expires_at,max_uses,used_at,revoked_at').eq('club_id', clubId).order('expires_at', { ascending: false })
  if (error) throw error
  return data as ClubInvite[]
}
async function rpc(name: string, args: Record<string, string>) {
  const { data, error } = await backend().rpc(name, args)
  if (error) throw error
  return data as string
}
export const createInvite = (clubId: string, role: MemberRole) => rpc('create_club_invite', { p_club_id: clubId, p_role: role })
export const acceptInvite = (token: string) => rpc('accept_club_invite', { p_token: token })
export const revokeInvite = (id: string) => rpc('revoke_club_invite', { p_invite_id: id })
export const setMemberRole = (clubId: string, userId: string, role: MemberRole) => rpc('set_member_role', { p_club_id: clubId, p_user_id: userId, p_role: role })
export const removeMember = (clubId: string, userId: string) => rpc('remove_member', { p_club_id: clubId, p_user_id: userId })
