import { backend } from './supabase'
import type { Evidence } from '../types/club'
const extensions: Record<string, string> = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }
export function validateFile(file: File) {
  const extension = extensions[file.type]
  if (!extension || !/\.(pdf|jpe?g|png)$/i.test(file.name)) throw new Error('Choose a PDF, JPEG or PNG file.')
  if (!file.size || file.size > 5 * 1024 * 1024) throw new Error('Files must be between 1 byte and 5 MB.')
  if (file.name.length > 255) throw new Error('File names must be 255 characters or fewer.')
  return extension
}
export async function listDocuments(clubId: string) {
  const { data, error } = await backend().from('evidence').select('*').eq('club_id', clubId).order('uploaded_at', { ascending: false })
  if (error) throw error
  return data as Evidence[]
}
export async function uploadDocument(clubId: string, userId: string, type: Evidence['document_type'], file: File) {
  const extension = validateFile(file)
  const client = backend()
  const path = `${clubId}/${crypto.randomUUID()}.${extension}`
  const uploaded = await client.storage.from('club-evidence').upload(path, file, { contentType: file.type, upsert: false })
  if (uploaded.error) throw uploaded.error
  try {
    const { error } = await client.from('evidence').insert({ club_id: clubId, uploaded_by: userId, document_type: type, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size, status: 'supplied' })
    if (error) throw error
  } catch (failure) {
    const cleanup = await client.storage.from('club-evidence').remove([path])
    if (cleanup.error) throw new Error(`Metadata could not be saved and cleanup failed. Ask an administrator to remove orphan file ${path}.`)
    throw failure
  }
}
export async function documentUrl(document: Evidence, download = false) {
  const { data, error } = await backend().storage.from('club-evidence').createSignedUrl(document.storage_path, 60, { download: download ? document.file_name : false })
  if (error) throw error
  return data.signedUrl
}
export async function deleteDocument(document: Evidence) {
  const client = backend()
  // Retain metadata if file deletion fails; a retry can also finish after an interrupted metadata deletion.
  const removed = await client.storage.from('club-evidence').remove([document.storage_path])
  if (removed.error) throw removed.error
  const { error } = await client.from('evidence').delete().eq('id', document.id).select('id').single()
  if (error) throw new Error('File removed, but metadata could not be deleted. Retry deletion to finish cleanup.')
}
