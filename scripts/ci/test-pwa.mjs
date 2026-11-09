// Exercise the generated production build, never a dev-only service worker.
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile, stat, mkdtemp, rm } from 'node:fs/promises'
import { resolve, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { chromium, devices, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { loadEnv } from 'vite'

const config = loadEnv('production', process.cwd(), 'VITE_')
const api = config.VITE_SUPABASE_URL
assert.equal(api, 'http://127.0.0.1:54321', 'PWA integration requires the fixed local API; hosted access prohibited')
const status = JSON.parse(execFileSync(process.env.LOCAL_SUPABASE_CLI || 'supabase', ['status', '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
assert.equal(status.API_URL, api)
const admin = createClient(api, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const client = createClient(api, status.ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG')))
Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: '54322', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGDATABASE: 'postgres' })
const sql = text => execFileSync('psql', ['-XAtq', '-v', 'ON_ERROR_STOP=1'], { env, input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
const good = result => { assert.equal(result.error, null, result.error?.message); return result.data }
const root = resolve('dist')
let version = 1
const privatePaths = /^\/(auth|rest|storage|functions|realtime)\/v1(?:\/|$)/
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://localhost')
    response.setHeader('Cache-Control', 'no-store')
    if (privatePaths.test(url.pathname)) { response.setHeader('Content-Type', 'text/plain'); response.end('PRIVATE_RESPONSE_MUST_NOT_BE_CACHED'); return }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname))
    if (!file.startsWith(root + '/')) file = resolve(root, 'index.html')
    try { if (!(await stat(file)).isFile()) file = resolve(root, 'index.html') } catch { file = resolve(root, 'index.html') }
    const types = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' }
    response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream')
    const bytes = await readFile(file)
    response.end(file === resolve(root, 'sw.js') ? Buffer.concat([bytes, Buffer.from(`\n// test release ${version}\n`)]) : bytes)
  } catch { response.statusCode = 500; response.end('Static server failure') }
})
await new Promise(done => server.listen(5183, '127.0.0.1', done))
const origin = 'http://127.0.0.1:5183'
let context, userId, clubId
const profile = await mkdtemp(join(tmpdir(), 'clubready-g2c-pwa-'))
const media = [], documents = []
const email = `g2c-pwa-${randomUUID()}@example.test`, password = 'Local-PWA-only-9284!'
let groups = 0
const pass = label => { groups++; console.log('PASS', label) }
try {
  const manifest = JSON.parse(await readFile('dist/manifest.webmanifest', 'utf8'))
  assert.equal(manifest.name, 'ClubReady 254'); assert.equal(manifest.short_name, 'ClubReady')
  for (const key of ['id', 'scope', 'start_url']) assert.equal(manifest[key], '/')
  assert.equal(manifest.display, 'standalone')
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(icon => icon.sizes === `${size}x${size}` && icon.purpose === 'any')
    assert.ok(icon)
    const bytes = await readFile(resolve(root, '.' + icon.src))
    assert.equal(bytes.readUInt32BE(16), size); assert.equal(bytes.readUInt32BE(20), size)
  }
  assert.ok(manifest.icons.find(icon => icon.purpose === 'maskable' && icon.sizes === '512x512'))
  const apple = await readFile('dist/apple-touch-icon.png'); assert.equal(apple.readUInt32BE(16), 180)
  pass('production manifest identity, scope, standalone display, raster dimensions, maskable and Apple icons')
  const created = good(await admin.auth.admin.createUser({ email, password, email_confirm: true }))
  userId = created.user.id
  good(await client.auth.signInWithPassword({ email, password }))
  clubId = good(await client.rpc('create_club', { p_name: 'G2C PWA fixture', p_county: 'Nairobi' }))
  context = await chromium.launchPersistentContext(profile, { executablePath: process.env.CHROME_PATH || '/opt/google/chrome/chrome', headless: true, args: ['--no-sandbox'], ...devices['Pixel 5'], serviceWorkers: 'allow' })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`${origin}/sign-in`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'G2C PWA fixture', exact: true })).toBeVisible()
  await page.evaluate(async () => { await navigator.serviceWorker.ready })
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  assert.equal(await page.evaluate(() => isSecureContext), true)
  const cdp = await context.newCDPSession(page)
  const installability = await cdp.send('Page.getInstallabilityErrors')
  assert.deepEqual(installability.installabilityErrors, [])
  pass('generated service worker registered and controlling a secure origin; Chromium reports no installability errors (Android emulation)')
  await page.goto(`${origin}/play-proof`)
  await expect(page.getByRole('heading', { name: 'Record activity' })).toBeVisible()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Record activity' })).toBeVisible({ timeout: 30000 })
  await page.getByLabel('Title', { exact: true }).fill('PWA offline activity')
  await page.getByLabel('Location', { exact: true }).fill('Offline pitch')
  await page.getByLabel(/Images \(optional/).setInputFiles({ name: 'pwa.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV0kAAAAASUVORK5CYII=', 'base64') })
  await expect(page.getByRole('button', { name: 'Save locally', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible()
  const uuid = await page.evaluate(async () => {
    const db = await new Promise((done, fail) => { const r = indexedDB.open('clubready-254'); r.onsuccess = () => done(r.result); r.onerror = fail })
    const rows = await new Promise(done => { const r = db.transaction('activities').objectStore('activities').getAll(); r.onsuccess = () => done(r.result) }); db.close(); return rows.find(row => row.title === 'PWA offline activity').id
  })
  assert.match(uuid, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/)
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto(`${origin}/play-proof`)
  await expect(reopened.getByRole('heading', { name: 'PWA offline activity' })).toBeVisible({ timeout: 30000 })
  await expect(reopened.getByRole('img', { name: 'pwa.png' })).toBeVisible()
  pass('offline deep-link reload, secure UUID, activity plus image persisted across closing and reopening the app page')
  await context.setOffline(false)
  await expect(reopened.getByText('Synced', { exact: true })).toBeVisible({ timeout: 45000 })
  assert.equal(sql(`select count(*) from public.activities where id='${uuid}' and club_id='${clubId}'`), '1')
  const attachments = good(await client.from('activity_attachments').select('storage_path').eq('activity_id', uuid))
  assert.equal(attachments.length, 1); media.push(...attachments.map(row => row.storage_path))
  pass('reconnection automatically syncs reopened activity and image once, without manual retry')
  for (const path of ['/rest/v1/rpc/readiness_lifecycle', '/auth/v1/user', '/storage/v1/object/sign/club-files/private.pdf?token=PRIVATE_TEST_TOKEN']) {
    assert.equal(await reopened.evaluate(async path => (await fetch(path)).text(), path), 'PRIVATE_RESPONSE_MUST_NOT_BE_CACHED')
  }
  // Also exercise real local private API and signed Storage requests under SW control.
  const pdfPath = `${clubId}/${randomUUID()}.pdf`
  good(await client.storage.from('club-evidence').upload(pdfPath, Buffer.from('%PDF-1.4\nPrivate PWA fixture\n%%EOF'), { contentType: 'application/pdf' }))
  documents.push(pdfPath)
  const signed = good(await client.storage.from('club-evidence').createSignedUrl(pdfPath, 60)).signedUrl
  assert.equal(new URL(signed).origin, api)
  assert.equal(await reopened.evaluate(async signed => (await fetch(signed)).status, signed), 200)
  const auth = good(await client.auth.getSession()).session
  await reopened.evaluate(async ({ api, key, token, clubId }) => {
    await fetch(`${api}/rest/v1/rpc/readiness_lifecycle`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_club: clubId }) })
    await fetch(`${api}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } })
    await fetch(`${api}/storage/v1/object/sign/club-files/private.pdf?token=PRIVATE_TEST_TOKEN`)
  }, { api, key: status.ANON_KEY, token: auth.access_token, clubId })
  const cached = await reopened.evaluate(async () => (await Promise.all((await caches.keys()).map(async name => (await (await caches.open(name)).keys()).map(request => request.url)))).flat())
  assert.ok(cached.length > 10)
  for (const url of cached) { const value = new URL(url); assert.equal(value.origin, origin); assert.ok(!privatePaths.test(value.pathname)); assert.ok(!/token|signed|supabase/i.test(value.search)) }
  await context.setOffline(true)
  for (const path of ['/rest/v1/rpc/readiness_lifecycle', '/auth/v1/user', '/storage/v1/object/sign/club-files/private.pdf?token=PRIVATE_TEST_TOKEN']) {
    assert.equal(await reopened.evaluate(async path => { try { await fetch(path); return 'served' } catch { return 'network-only' } }, path), 'network-only')
  }
  assert.equal(await reopened.evaluate(async signed => { try { await fetch(signed); return 'served' } catch { return 'network-only' } }, signed), 'network-only')
  const privateTab = await context.newPage()
  await assert.rejects(privateTab.goto(`${origin}/storage/v1/object/sign/club-files/private.pdf?token=PRIVATE_TEST_TOKEN`))
  await privateTab.close()
  pass('private auth, readiness and signed-file responses excluded from Cache Storage; private navigation cannot fall back to cached shell')
  await context.setOffline(false)
  version++
  await reopened.evaluate(async () => { await (await navigator.serviceWorker.ready).update() })
  await expect.poll(() => reopened.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting), { timeout: 20000 }).toBe(true)
  assert.equal(await reopened.evaluate(() => !!navigator.serviceWorker.controller), true)
  await expect(reopened.getByRole('button', { name: 'Update app' })).toBeVisible({ timeout: 20000 })
  reopened.on('dialog', dialog => dialog.accept())
  const reload = reopened.waitForEvent('domcontentloaded')
  await reopened.getByRole('button', { name: 'Update app' }).click()
  await reload
  await expect(reopened.getByRole('heading', { name: 'PWA offline activity' })).toBeVisible({ timeout: 30000 })
  await expect.poll(() => reopened.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()).waiting)).toBe(false)
  pass('new worker waits for explicit confirmed update, activates and preserves saved activity')
  await reopened.getByRole('button', { name: 'Account menu' }).click()
  await reopened.getByRole('button', { name: 'Sign out', exact: true }).click()
  await expect(reopened.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await expect(reopened.getByRole('heading', { name: 'PWA offline activity' })).toHaveCount(0)
  assert.deepEqual(errors, [])
  pass('logout removes private UI; no uncaught production page errors')
  console.log(`PASS ${groups} production PWA groups; native device installation remains a manual check`)
} finally {
  await context?.close(); await rm(profile, { recursive: true, force: true }); await new Promise(done => server.close(done))
  if (documents.length) good(await admin.storage.from('club-evidence').remove(documents))
  if (media.length) good(await admin.storage.from('activity-media').remove(media))
  if (clubId) {
    // Remove only this explicitly created fixture's rows, never global queue/data.
    sql(`delete from public.activity_attachments where activity_id in (select id from public.activities where club_id='${clubId}'); delete from public.activities where club_id='${clubId}'; delete from public.clubs where id='${clubId}';`)
  }
  if (userId) good(await admin.auth.admin.deleteUser(userId))
  await client.auth.signOut()
}
