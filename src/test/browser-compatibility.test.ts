import { afterEach, expect, it, vi } from 'vitest'
import { secureUUID } from '../services/uuid'
import { authRedirect } from '../services/auth-redirect'
import { db, saveActivity } from '../db/offline'

afterEach(async () => { vi.restoreAllMocks(); await db.delete(); await db.open() })
it('prefers native UUID generation with the crypto receiver', () => {
  const source = { randomUUID() { expect(this).toBe(source); return 'native-uuid' } } as unknown as Crypto
  expect(secureUUID(source)).toBe('native-uuid')
})
it('uses secure random bytes and sets RFC version and variant bits without native UUID', () => {
  const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(255); return bytes })
  expect(secureUUID({ getRandomValues } as unknown as Crypto)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
  expect(getRandomValues).toHaveBeenCalledOnce()
  expect(() => secureUUID({} as Crypto)).toThrow('Secure random generation is unavailable')
})
it('saves mobile activities with native UUID unavailable', async () => {
  vi.spyOn(crypto, 'randomUUID').mockImplementation(undefined as never)
  const row = await saveActivity('user', 'club', { activity_type: 'training', title: 'Mobile', date: '2026-11-09', location: 'Field', participants_count: 2, notes: '' })
  expect(row.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  expect(await db.activities.get(row.id)).toMatchObject({ sync_status: 'saved_locally' })
})
it.each(['http://localhost:5173', 'http://127.0.0.1:5173', 'https://frontend-dev.clubready.pages.dev', 'https://clubready.example'])('constructs same-origin auth callbacks for %s', origin => {
  expect(authRedirect('/sign-in', '?next=%2Fjoin%2Ftoken', origin)).toBe(`${origin}/sign-in?next=%2Fjoin%2Ftoken`)
  expect(authRedirect('/reset-password', '', origin)).toBe(`${origin}/reset-password`)
})
