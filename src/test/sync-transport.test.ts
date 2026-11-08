import { Blob as NodeBlob } from 'node:buffer'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cloudTransport, LoginRequired } from '../services/sync/transport'
const mock = vi.hoisted(() => ({ upload: vi.fn(), download: vi.fn(), upsert: vi.fn(), getSession: vi.fn(), from: vi.fn() }))
vi.mock('../services/supabase', () => ({ backend: () => ({ auth: { getSession: mock.getSession }, storage: { from: () => ({ upload: mock.upload, download: mock.download }) }, from: mock.from }) }))
const photo = { id: 'image', activity_id: 'activity', name: 'photo.jpg', blob: new NodeBlob(['photo'], { type: 'image/jpeg' }) as unknown as Blob }
beforeEach(() => { Object.values(mock).forEach(fn => fn.mockReset()); mock.from.mockReturnValue({ upsert: mock.upsert }); mock.upsert.mockResolvedValue({ error: null }) })
describe('Supabase sync transport', () => {
  it('accepts already-existing images only after comparing their bytes', async () => {
    mock.upload.mockResolvedValue({ error: { statusCode: '400', message: 'The resource already exists' } })
    mock.download.mockResolvedValue({ data: new NodeBlob(['photo']), error: null })
    await cloudTransport.upload('club/activity/image.jpg', photo)
    expect(mock.upload).toHaveBeenCalledWith('club/activity/image.jpg', photo.blob, { upsert: false, contentType: 'image/jpeg' })
    mock.download.mockResolvedValue({ data: new NodeBlob(['other']), error: null })
    await expect(cloudTransport.upload('club/activity/image.jpg', photo)).rejects.toThrow('differs')
  })
  it('propagates permission errors and pauses on expired authentication', async () => {
    mock.upload.mockResolvedValue({ error: { statusCode: '403', message: 'Forbidden' } })
    await expect(cloudTransport.upload('path', photo)).rejects.toMatchObject({ statusCode: '403' })
    expect(mock.download).not.toHaveBeenCalled()
    mock.upload.mockResolvedValue({ error: { statusCode: '401', message: 'JWT expired' } })
    await expect(cloudTransport.upload('path', photo)).rejects.toBeInstanceOf(LoginRequired)
  })
  it('uses ignoreDuplicates and never enables merge updates', async () => {
    const row = { id: 'activity', club_id: 'club', created_by: 'user', activity_type: 'training', title: 'Practice', date: '2026-11-08', location: 'Field', participants_count: 10, notes: '', created_at: '2026-11-08T00:00:00Z' }
    await cloudTransport.insertActivity(row)
    expect(mock.from).toHaveBeenCalledWith('activities')
    expect(mock.upsert).toHaveBeenCalledWith(row, { onConflict: 'id', ignoreDuplicates: true })
    const metadata = { id: 'image', activity_id: 'activity', storage_path: 'path', mime_type: 'image/jpeg', file_size: 5 }
    await cloudTransport.insertAttachment(metadata)
    expect(mock.from).toHaveBeenCalledWith('activity_attachments')
    expect(mock.upsert).toHaveBeenLastCalledWith(metadata, { onConflict: 'id', ignoreDuplicates: true })
  })
  it('requires an unexpired session belonging to the record owner', async () => {
    mock.getSession.mockResolvedValue({ data: { session: null }, error: { status: 400, code: 'refresh_token_not_found' } })
    await expect(cloudTransport.authenticate('user')).rejects.toBeInstanceOf(LoginRequired)
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'other' }, expires_at: Date.now() / 1000 + 1000 } }, error: null })
    await expect(cloudTransport.authenticate('user')).rejects.toBeInstanceOf(LoginRequired)
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'user' }, expires_at: 1 } }, error: null })
    await expect(cloudTransport.authenticate('user')).rejects.toBeInstanceOf(LoginRequired)
    mock.getSession.mockResolvedValue({ data: { session: { user: { id: 'user' }, expires_at: Date.now() / 1000 + 1000 } }, error: null })
    await cloudTransport.authenticate('user')
  })
})
