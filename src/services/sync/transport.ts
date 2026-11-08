import { backend } from '../supabase'
import type { Attachment, LocalActivity } from '../activities'

export class LoginRequired extends Error {}
export interface CloudActivity {
  id: string; club_id: string; created_by: string; activity_type: string; title: string
  date: string; location: string; participants_count: number; notes: string; created_at: string
}
export interface CloudAttachment { id: string; activity_id: string; storage_path: string; mime_type: string; file_size: number }
export interface SyncTransport {
  authenticate(userId: string): Promise<void>
  upload(path: string, attachment: Attachment): Promise<void>
  insertActivity(row: CloudActivity): Promise<void>
  readActivity(id: string): Promise<CloudActivity>
  insertAttachment(row: CloudAttachment): Promise<void>
  readAttachment(id: string): Promise<CloudAttachment>
}
function checked(error: unknown) {
  if (!error) return
  const failure = error as { status?: number; statusCode?: string | number; code?: string; message?: string }
  if (Number(failure.status ?? failure.statusCode) === 401 || ['PGRST301', 'session_not_found', 'session_expired', 'refresh_token_not_found', 'refresh_token_already_used'].includes(failure.code ?? '') || /jwt.*expired|invalid.*jwt/i.test(failure.message ?? '')) throw new LoginRequired('Sign in again to continue syncing. Your activities are safe on this device.')
  throw error
}
export function activityRow(row: LocalActivity): CloudActivity {
  return { id: row.id, club_id: row.club_id, created_by: row.created_by, activity_type: row.activity_type, title: row.title, date: row.date, location: row.location, participants_count: row.participants_count, notes: row.notes, created_at: row.createdAt }
}
export const cloudTransport: SyncTransport = {
  async authenticate(userId) {
    const { data, error } = await backend().auth.getSession()
    checked(error)
    if (!data.session || data.session.user.id !== userId || (data.session.expires_at ?? 0) * 1000 <= Date.now()) throw new LoginRequired('Sign in again to continue syncing. Your activities are safe on this device.')
  },
  async upload(path, attachment) {
    const bucket = backend().storage.from('activity-media')
    const { error } = await bucket.upload(path, attachment.blob, { contentType: attachment.blob.type, upsert: false })
    if (!error) return
    // Duplicate responses vary between Storage versions; other errors must fail.
    const failure = error as { statusCode?: string; code?: string; message: string }
    const duplicate = failure.code === 'KeyAlreadyExists' || failure.code === 'ResourceAlreadyExists' || failure.code === 'already_exists' || /^(the resource|asset) already exists\.?$/i.test(failure.message)
    if (!duplicate) checked(error)
    // A conflict alone does not establish that the existing bytes are ours.
    const { data, error: readError } = await bucket.download(path)
    checked(readError)
    if (!data || data.size !== attachment.blob.size) throw new Error('The cloud image differs from the local image.')
    const [remote, local] = await Promise.all([data.arrayBuffer(), attachment.blob.arrayBuffer()])
    const a = new Uint8Array(remote), b = new Uint8Array(local)
    if (a.some((value, index) => value !== b[index])) throw new Error('The cloud image differs from the local image.')
  },
  async insertActivity(row) { const { error } = await backend().from('activities').upsert(row, { onConflict: 'id', ignoreDuplicates: true }); checked(error) },
  async readActivity(id) { const { data, error } = await backend().from('activities').select('id,club_id,created_by,activity_type,title,date,location,participants_count,notes,created_at').eq('id', id).single(); checked(error); return data as CloudActivity },
  async insertAttachment(row) { const { error } = await backend().from('activity_attachments').upsert(row, { onConflict: 'id', ignoreDuplicates: true }); checked(error) },
  async readAttachment(id) { const { data, error } = await backend().from('activity_attachments').select('id,activity_id,storage_path,mime_type,file_size').eq('id', id).single(); checked(error); return data as CloudAttachment },
}
