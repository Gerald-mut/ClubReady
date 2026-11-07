import { beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteDocument, documentUrl, uploadDocument, validateFile } from '../services/documents'
import type { Evidence } from '../types/club'
const mock = vi.hoisted(() => ({ upload: vi.fn(), remove: vi.fn(), createSignedUrl: vi.fn(), insert: vi.fn(), single: vi.fn(), eq: vi.fn(), select: vi.fn(), delete: vi.fn() }))
vi.mock('../services/supabase', () => ({ backend: () => ({ storage: { from: () => mock }, from: () => mock }) }))
const document = { id: 'evidence-a', storage_path: 'club-a/uuid.pdf', file_name: 'registration.pdf' } as Evidence
beforeEach(() => {
  Object.values(mock).forEach(fn => fn.mockReset())
  mock.upload.mockResolvedValue({ error: null }); mock.remove.mockResolvedValue({ error: null }); mock.insert.mockResolvedValue({ error: null })
  mock.delete.mockReturnValue(mock); mock.eq.mockReturnValue(mock); mock.select.mockReturnValue(mock); mock.single.mockResolvedValue({ data: { id: document.id }, error: null })
})
describe('file validation', () => {
  it.each([['test.pdf','application/pdf','pdf'],['test.jpg','image/jpeg','jpg'],['test.png','image/png','png']])('accepts %s', (name, type, extension) => { expect(validateFile(new File(['contents'], name, { type }))).toBe(extension) })
  it('rejects unsupported formats', () => { expect(() => validateFile(new File(['x'], 'bad.svg', { type: 'image/svg+xml' }))).toThrow('PDF, JPEG or PNG') })
  it('rejects oversized and empty files', () => {
    expect(() => validateFile(new File([new Uint8Array(5242881)], 'large.pdf', { type: 'application/pdf' }))).toThrow('5 MB')
    expect(() => validateFile(new File([], 'empty.pdf', { type: 'application/pdf' }))).toThrow('1 byte')
  })
  it('accepts exactly 5 MB', () => { expect(validateFile(new File([new Uint8Array(5242880)], 'limit.pdf', { type: 'application/pdf' }))).toBe('pdf') })
})
describe('private document service', () => {
  it.each([
    [new File(['x'], 'bad.svg', { type: 'image/svg+xml' }), 'PDF, JPEG or PNG'],
    [new File(['x'], 'bad.txt', { type: 'application/pdf' }), 'PDF, JPEG or PNG'],
    [new File([new Uint8Array(5242881)], 'large.pdf', { type: 'application/pdf' }), '5 MB'],
    [new File(['x'], `${'a'.repeat(252)}.pdf`, { type: 'application/pdf' }), '255 characters'],
  ])('rejects invalid upload %s before writing storage or metadata', async (file, error) => {
    await expect(uploadDocument('club-a', 'user-a', 'other', file)).rejects.toThrow(error)
    expect(mock.upload).not.toHaveBeenCalled()
    expect(mock.insert).not.toHaveBeenCalled()
  })
  it('uploads a unique club-scoped path and supplied metadata', async () => {
    await uploadDocument('club-a','user-a','other',new File(['pdf'], 'test.pdf', { type: 'application/pdf' }))
    expect(mock.upload).toHaveBeenCalledWith(expect.stringMatching(/^club-a\/[\da-f-]+\.pdf$/), expect.any(File), { contentType: 'application/pdf', upsert: false })
    expect(mock.insert).toHaveBeenCalledWith(expect.objectContaining({ club_id: 'club-a', uploaded_by: 'user-a', status: 'supplied' }))
  })
  it('does not save metadata after upload failure', async () => {
    mock.upload.mockResolvedValue({ error: new Error('Upload denied') })
    await expect(uploadDocument('a','u','other',new File(['x'], 'x.pdf', { type: 'application/pdf' }))).rejects.toThrow('Upload denied')
    expect(mock.insert).not.toHaveBeenCalled()
  })
  it('cleans up a file if metadata creation fails', async () => {
    mock.insert.mockResolvedValue({ error: new Error('Metadata denied') })
    await expect(uploadDocument('a','u','other',new File(['x'], 'x.pdf', { type: 'application/pdf' }))).rejects.toThrow('Metadata denied')
    expect(mock.remove).toHaveBeenCalledWith([expect.stringMatching(/^a\//)])
  })
  it('reports an orphan if cleanup also fails', async () => {
    mock.insert.mockResolvedValue({ error: new Error('Denied') }); mock.remove.mockResolvedValue({ error: new Error('Offline') })
    await expect(uploadDocument('a','u','other',new File(['x'], 'x.pdf', { type: 'application/pdf' }))).rejects.toThrow('orphan file')
  })
  it('uses 60-second signed download links', async () => {
    mock.createSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://private.example/signed' }, error: null })
    expect(await documentUrl(document,true)).toBe('https://private.example/signed')
    expect(mock.createSignedUrl).toHaveBeenCalledWith(document.storage_path,60,{ download: document.file_name })
  })
  it('surfaces private access errors', async () => {
    mock.createSignedUrl.mockResolvedValue({ error: new Error('Not permitted') })
    await expect(documentUrl(document)).rejects.toThrow('Not permitted')
  })
  it('deletes the file then metadata', async () => {
    await deleteDocument(document)
    expect(mock.remove).toHaveBeenCalledWith([document.storage_path]); expect(mock.eq).toHaveBeenCalledWith('id', document.id)
    expect(mock.remove.mock.invocationCallOrder[0]).toBeLessThan(mock.delete.mock.invocationCallOrder[0])
  })
  it('retains metadata if storage deletion fails', async () => {
    mock.remove.mockResolvedValue({ error: new Error('Storage unavailable') })
    await expect(deleteDocument(document)).rejects.toThrow('Storage unavailable'); expect(mock.delete).not.toHaveBeenCalled()
  })
  it('supports retry after metadata deletion failure', async () => {
    mock.single.mockResolvedValue({ error: new Error('Metadata unavailable') })
    await expect(deleteDocument(document)).rejects.toThrow('Retry deletion')
  })
})
