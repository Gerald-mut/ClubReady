export const activityTypes = ['training', 'match', 'tournament', 'community', 'other'] as const
export type SyncStatus = 'saved_locally' | 'pending_sync' | 'uploading' | 'synced' | 'failed'
export interface ActivityInput {
  activity_type: typeof activityTypes[number]; title: string; date: string
  location: string; participants_count: number; notes: string
}
export interface LocalActivity extends ActivityInput {
  id: string; club_id: string; created_by: string; createdAt: string; sync_status: SyncStatus
}
export interface Attachment { id: string; activity_id: string; blob: Blob; name: string }
export const MAX_IMAGE_BYTES = 1024 * 1024
export function validateActivity(input: ActivityInput): string {
  if (!activityTypes.includes(input.activity_type)) return 'Choose an activity type.'
  if (!input.title.trim() || input.title.length > 150) return 'Enter a title of up to 150 characters.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(Date.parse(input.date)) || new Date(input.date).toISOString().slice(0, 10) !== input.date) return 'Enter a valid activity date.'
  if (!input.location.trim() || input.location.length > 200) return 'Enter a location of up to 200 characters.'
  if (!Number.isSafeInteger(input.participants_count) || input.participants_count < 1) return 'Enter a whole participant count of at least 1.'
  if (input.notes.length > 5000) return 'Keep notes within 5,000 characters.'
  return ''
}
export async function compressImage(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Choose JPEG, PNG or WebP images.')
  const url = URL.createObjectURL(file)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Unable to read image.')); image.src = url })
    let scale = Math.min(1, 1600 / Math.max(image.width, image.height))
    for (let attempt = 0; attempt < 8; attempt++, scale *= 0.75) {
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Image compression is unavailable.')
      context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(image, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.8))
      if (blob && blob.size <= MAX_IMAGE_BYTES) return blob
    }
    throw new Error('Image could not be compressed below 1 MiB.')
  } finally { URL.revokeObjectURL(url) }
}
