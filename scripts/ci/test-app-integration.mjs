// Local-only Auth/PostgREST/Storage/worker/browser integration. Never reads .env.local.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID, createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'

const cli = process.env.LOCAL_SUPABASE_CLI || 'supabase'
const workdir = process.env.LOCAL_SUPABASE_WORKDIR
const args = ['status', '-o', 'json', ...(workdir ? ['--workdir', workdir] : [])]
let status
try { status = JSON.parse(execFileSync(cli, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })) }
catch { throw new Error('Disposable local Supabase status unavailable; output withheld to protect local keys.') }
const url = 'http://127.0.0.1:54321'
assert.equal(status.API_URL, url, 'Only fixed disposable local API is permitted')
const key = status.ANON_KEY
assert.ok(key)
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('PG')))
Object.assign(env, { PGHOST: '127.0.0.1', PGPORT: '54322', PGDATABASE: 'postgres', PGUSER: 'postgres', PGPASSWORD: 'postgres', PGCONNECT_TIMEOUT: '5' })
function sql(text) { return execFileSync('psql', ['-XAtq', '-v', 'ON_ERROR_STOP=1'], { env, input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 20000 }).trim() }
function good(result, label) { assert.equal(result.error, null, `${label}: ${result.error?.message}`); return result.data }
function denied(result, label) { assert.ok(result.error, label) }
let checks = 0
function pass(label) { checks++; console.log('PASS', label) }
const clients = []
const users = [], clubs = [], documents = [], media = []
const opportunity = randomUUID(), training = randomUUID(), registration = randomUUID()
let server, browser, context, page
const password = 'Local-integration-only-9284!'
const email = `phase-f-${randomUUID()}@example.test`
const emailB = `phase-f-${randomUUID()}@example.test`
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV0kAAAAASUVORK5CYII=', 'base64')
const pdf = Buffer.from('%PDF-1.4\nPhase F disposable fixture\n%%EOF')
const client = () => { const c = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }); clients.push(c); return c }
const a = client(), b = client()
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
async function worker(club) {
  for (let i = 0; i < 100; i++) {
    sql('set role readiness_worker; select public.process_next_job();')
    if (sql(`select count(*) from public.processing_jobs where club_id='${club}' and status='queued'`) === '0') return
  }
  throw new Error('Local worker did not drain test club within 100 calls')
}
try {
  server = await createServer({ envPrefix: 'PHASE_F_NO_ENV_', define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(url),
    'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(key),
  }, server: { host: '127.0.0.1', port: 5182, strictPort: true } })
  await server.listen()
  browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), headless: true, args: ['--no-sandbox'] })
  context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' })
  // Fail closed on all nonlocal browser traffic, including accidental hosted config.
  await context.route('**/*', async route => {
    try {
      if (['127.0.0.1', 'localhost'].includes(new URL(route.request().url()).hostname)) await route.continue()
      else await route.abort()
    } catch (error) {
      // Navigation/unrouting may complete a pending request before its handler resumes.
      if (!error.message.includes('Route is already handled')) throw error
    }
  })
  // Exercise the compatibility path used by older mobile browsers in every UI flow.
  await context.addInitScript(() => { Object.defineProperty(Crypto.prototype, 'randomUUID', { configurable: true, value: undefined }) })
  page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  const origin = 'http://127.0.0.1:5182'
  await page.goto(`${origin}/sign-up`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create your account' }).click()
  await expect(page.getByRole('heading', { name: 'Set up your club' })).toBeVisible()
  const login = good(await a.auth.signInWithPassword({ email, password }), 'local login')
  users.push(login.user.id)
  await page.getByLabel('Club name (required)').fill('Phase F Football Club')
  await page.getByLabel('County (required)').fill('Nairobi')
  await page.getByRole('button', { name: 'Create club', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Phase F Football Club', exact: true })).toBeVisible()
  const club = good(await a.from('club_members').select('club_id').eq('user_id', login.user.id).single(), 'membership').club_id
  clubs.push(club)
  const signupB = good(await b.auth.signUp({ email: emailB, password }), 'independent signup')
  users.push(signupB.user.id)
  const clubB = good(await b.rpc('create_club', { p_name: 'Independent Club B', p_county: 'Nairobi' }), 'club B')
  clubs.push(clubB)
  pass('real browser registration, API login, club creation and independent active memberships')
  sql(`insert into public.opportunities(id,title,organiser,description,source_url,application_method,status,review_date) values('${opportunity}','Phase F local opportunity','Local fixture','Disposable integration criteria','https://example.org','Review local criteria','unconfirmed',current_date);
    insert into public.opportunity_requirements(id,opportunity_id,version,requirement_type,document_type,description,min_count,source_note,verification,source_reference) values
    ('${training}','${opportunity}',1,'activity',null,'Training evidence',1,'Explicit local test curation','verified','{"verified_at":"2026-11-08"}'),
    ('${registration}','${opportunity}',1,'document','club_registration','Registration evidence',1,'Explicit local test curation','verified','{"verified_at":"2026-11-08"}');
    insert into public.readiness_requirement_mappings(requirement_id,opportunity_id,requirement_version,mapping_type,document_type,activity_type,min_count) values
    ('${training}','${opportunity}',1,'activity',null,'training',1),('${registration}','${opportunity}',1,'document','club_registration',null,1);`)
  await page.goto(`${origin}/`)
  await expect(page.getByText('Assessment: Queued', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Refresh assessment', exact: true }).click()
  await expect(page.getByText('Assessment requested. Reassessment may take time.')).toBeVisible()
  await page.getByRole('button', { name: 'Refresh assessment', exact: true }).click()
  await expect(page.getByText(/Assessment request rate limited/)).toBeVisible()
  pass('browser reassessment acknowledgement, pending lifecycle and database cooldown')
  await page.goto(`${origin}/play-proof`)
  await page.getByLabel('Title', { exact: true }).fill('Integrated training session')
  await page.getByLabel('Location', { exact: true }).fill('Local pitch')
  await page.getByLabel('Images (optional', { exact: false }).setInputFiles({ name: 'local.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Synced', { exact: true })).toBeVisible({ timeout: 20000 })
  const activity = good(await a.from('activities').select('*').eq('club_id', club).eq('title', 'Integrated training session').single(), 'synced activity')
  const attachments = good(await a.from('activity_attachments').select('*').eq('activity_id', activity.id), 'synced attachments')
  assert.equal(attachments.length, 1); media.push(attachments[0].storage_path)
  good(await a.storage.from('activity-media').download(attachments[0].storage_path), 'physical activity object')
  assert.equal(good(await a.rpc('readiness_lifecycle', { p_club: club }), 'queued activity').state, 'queued')
  await worker(club)
  const result = good(await a.from('readiness_results').select('*').eq('club_id', club).eq('requirement_id', training).single(), 'activity result')
  assert.equal(result.status, 'supplied')
  assert.equal(good(await a.from('readiness_result_evidence').select('*').eq('result_id', result.id).single(), 'exact activity support').activity_id, activity.id)
  await page.goto(`${origin}/opportunities`)
  await page.getByRole('link', { name: 'Phase F local opportunity', exact: true }).click()
  await expect(page.getByText('Assessment: Up to date', { exact: true })).toBeVisible()
  await expect(page.getByText('Evidence status: Supplied', { exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Integrated training session', exact: true })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: 'Opportunities', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Phase F local opportunity', exact: true }).getByText('View opportunity').click()
  await expect(page.getByRole('heading', { name: 'Requirements and Club Evidence' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Application tracking' })).toHaveCount(0)
  pass('browser activity and image -> Storage/PostgREST -> trusted worker -> exact persisted support -> real frontend')
  // Upload through the actual document UI, not privileged SQL.
  await page.goto(`${origin}/club-profile?section=documents`)
  await page.getByLabel('Document type', { exact: false }).selectOption('club_registration')
  await page.getByLabel('File (PDF', { exact: false }).setInputFiles({ name: 'registration.pdf', mimeType: 'application/pdf', buffer: pdf })
  await page.getByRole('button', { name: 'Upload document', exact: true }).click()
  await expect(page.getByText('registration.pdf', { exact: true })).toBeVisible()
  const evidence = good(await a.from('evidence').select('*').eq('club_id', club).eq('file_name', 'registration.pdf').single(), 'document metadata')
  documents.push(evidence.storage_path)
  assert.equal(evidence.uploaded_by, login.user.id)
  assert.equal(sql(`select owner_id from storage.objects where bucket_id='club-evidence' and name='${evidence.storage_path}'`), login.user.id)
  const downloaded = good(await a.storage.from('club-evidence').download(evidence.storage_path), 'document bytes')
  assert.equal(Buffer.from(await downloaded.arrayBuffer()).compare(pdf), 0)
  await worker(club)
  let docResult = good(await a.from('readiness_results').select('*').eq('club_id', club).eq('requirement_id', registration).single(), 'document result')
  assert.equal(docResult.status, 'unknown', 'null expiry never establishes currency')
  assert.equal(good(await a.from('readiness_result_evidence').select('*').eq('result_id', docResult.id).single(), 'document support').evidence_id, evidence.id)
  for (const requirementId of ['64000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000006']) {
    const curated = good(await a.from('readiness_results').select('*').eq('club_id', club).eq('requirement_id', requirementId).single(), 'curated registration result')
    assert.equal(curated.status, 'unknown', 'uploaded registration has unknown expiry; never approved')
    assert.equal(good(await a.from('readiness_result_evidence').select('*').eq('result_id', curated.id).single(), 'curated registration support').evidence_id, evidence.id)
  }
  assert.equal(sql("select count(*) from public.readiness_requirement_mappings where requirement_id='64000000-0000-0000-0000-000000000013'"), '0', 'unverified requirement remains unmapped')
  pass('current curated registration mappings link the actual upload without approving it')
  // Trusted fixture expiry establishes a deterministic expiring case; browser cannot modify it.
  sql(`update public.evidence set expires_at=(clock_timestamp() at time zone 'UTC')::date+7 where id='${evidence.id}'`)
  await worker(club)
  await page.goto(`${origin}/opportunities/${opportunity}`)
  await expect(page.getByText('Evidence status: Expiring', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open registration.pdf', exact: true }).click()
  const privateLink = await page.getByRole('link', { name: 'registration.pdf', exact: true }).getAttribute('href')
  assert.equal((await fetch(privateLink)).status, 200)
  pass('real evidence Storage bytes, metadata owner, exact support, conservative null expiry, expiring status and signed document link')
  // True independent-club security: denied by DB/Storage, not route guards.
  for (const table of ['readiness_results', 'readiness_result_evidence', 'evidence']) {
    assert.deepEqual(good(await b.from(table).select('*').eq('club_id', club), `cross-club ${table}`), [])
  }
  denied(await b.storage.from('club-evidence').createSignedUrl(evidence.storage_path, 60), 'cross-club signed evidence')
  denied(await b.storage.from('activity-media').download(attachments[0].storage_path), 'cross-club activity bytes')
  denied(await b.rpc('request_readiness_assessment', { p_club: club }), 'cross-club recompute')
  denied(await b.rpc('readiness_lifecycle', { p_club: club }), 'cross-club lifecycle')
  denied(await a.from('processing_jobs').select('*'), 'queue read')
  denied(await a.from('processing_jobs').insert({ club_id: club }), 'queue insert')
  denied(await a.from('processing_jobs').update({ payload: { malicious: true } }).eq('club_id', club), 'queue mutate')
  denied(await a.rpc('process_next_job'), 'worker execution')
  pass('independent-club result/support/document/media/lifecycle/recompute isolation and queue/worker denial')
  // Concurrent real Storage uploads and PostgREST quota attempts.
  const ids = Array.from({ length: 4 }, () => randomUUID())
  const paths = ids.map(id => `${club}/${activity.id}/${id}.jpg`)
  const uploaded = await Promise.all(paths.map(path => a.storage.from('activity-media').upload(path, png, { contentType: 'image/png' })))
  uploaded.forEach((r, i) => good(r, `concurrent object ${i}`)); media.push(...paths)
  const writes = await Promise.all(ids.map((id, i) => a.from('activity_attachments').insert({ id, activity_id: activity.id, storage_path: paths[i], mime_type: 'image/png', file_size: png.length })))
  assert.equal(writes.filter(r => !r.error).length, 2, 'existing one plus exactly two concurrent attachments allowed')
  assert.equal(good(await a.from('activity_attachments').select('*').eq('activity_id', activity.id), 'quota rows').length, 3)
  const badPath = `${club}/${activity.id}/${randomUUID()}.jpg`
  good(await a.storage.from('activity-media').upload(badPath, png, { contentType: 'image/png' }), 'mismatch object'); media.push(badPath)
  denied(await a.from('activity_attachments').insert({ id: badPath.split('/')[2].slice(0, -4), activity_id: activity.id, storage_path: badPath, mime_type: 'image/png', file_size: png.length + 1 }), 'object metadata mismatch')
  denied(await a.storage.from('activity-media').upload(`${club}/${activity.id}/${randomUUID()}.jpg`, Buffer.alloc(1048577), { contentType: 'image/jpeg' }), 'one MiB bucket limit')
  denied(await a.storage.from('club-evidence').upload(`${club}/${randomUUID()}.pdf`, Buffer.alloc(5242881), { contentType: 'application/pdf' }), 'five MiB evidence limit')
  pass('concurrent real uploads, three-attachment DB quota, metadata consistency and both bucket size limits')
  // Lost response after real Storage commit: retry verifies the existing bytes.
  await page.goto(`${origin}/play-proof`)
  let cutUpload = true
  await page.route('**/storage/v1/object/activity-media/**', async route => {
    if (route.request().method() === 'POST' && cutUpload) { cutUpload = false; await route.fetch(); await route.abort('failed') } else await route.fallback()
  })
  await page.getByLabel('Title', { exact: true }).fill('Interrupted image sync')
  await page.getByLabel('Location', { exact: true }).fill('Local pitch')
  await page.getByLabel('Images (optional', { exact: false }).setInputFiles({ name: 'retry.png', mimeType: 'image/png', buffer: png })
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Sync failed - retry', { exact: true })).toBeVisible({ timeout: 20000 })
  await page.unroute('**/storage/v1/object/activity-media/**')
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click()
  await expect(page.getByText('Sync failed - retry', { exact: true })).toHaveCount(0)
  await expect.poll(async () => good(await a.from('activities').select('id').eq('club_id', club).eq('title', 'Interrupted image sync'), 'image activity recovery').length, { timeout: 20000 }).toBe(1)
  const interrupted = good(await a.from('activities').select('id').eq('club_id', club).eq('title', 'Interrupted image sync').single(), 'recovered image activity')
  await expect.poll(async () => good(await a.from('activity_attachments').select('id').eq('activity_id', interrupted.id), 'image metadata recovery').length, { timeout: 20000 }).toBe(1)
  const recovered = good(await a.from('activity_attachments').select('*').eq('activity_id', interrupted.id), 'recovered image link')
  assert.equal(recovered.length, 1); media.push(recovered[0].storage_path)
  pass('lost response after physical attachment upload, duplicate byte verification and successful retry without duplicates')
  // Lost response after activity commit, retaining immutable UUID on replay.
  let cutActivity = true
  await page.route('**/rest/v1/activities*', async route => {
    if (route.request().method() === 'POST' && cutActivity) { cutActivity = false; await route.fetch(); await route.abort('failed') } else await route.fallback()
  })
  await page.getByLabel('Title', { exact: true }).fill('Interrupted activity sync')
  await page.getByLabel('Location', { exact: true }).fill('Local pitch')
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Sync failed - retry', { exact: true })).toBeVisible()
  await page.unroute('**/rest/v1/activities*')
  await page.getByRole('button', { name: 'Retry sync', exact: true }).click()
  await expect(page.getByText('Sync failed - retry', { exact: true })).toHaveCount(0)
  await expect.poll(async () => good(await a.from('activities').select('id').eq('club_id', club).eq('title', 'Interrupted activity sync'), 'replayed activity').length, { timeout: 20000 }).toBe(1)
  pass('lost activity commit acknowledgement, stable UUID replay and one persisted record')
  await expect(page.getByRole('heading', { name: 'Interrupted activity sync', exact: true }).locator('..').getByText('Synced', { exact: true })).toBeVisible()
  // Offline capture and real reconnect (same loaded app, no mocked transport).
  await page.locator('summary').filter({ hasText: 'Activity sync' }).click()
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled()
  await context.setOffline(true)
  await page.getByLabel('Title', { exact: true }).fill('Offline reconnect session')
  await page.getByLabel('Location', { exact: true }).fill('Offline pitch')
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText('Saved locally', { exact: true })).toHaveCount(0, { timeout: 45000 })
  await expect.poll(async () => good(await a.from('activities').select('id').eq('club_id', club).eq('title', 'Offline reconnect session'), 'reconnected activity').length, { timeout: 20000 }).toBe(1)
  pass('real browser offline capture and online event recovery')
  // Expired JWT API denial plus transport's auth-expired branch during sync.
  const tokenPart = obj => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const tokenBody = `${tokenPart({ alg: 'HS256', typ: 'JWT' })}.${tokenPart({ sub: login.user.id, role: 'authenticated', aud: 'authenticated', exp: 1 })}`
  const expiredToken = `${tokenBody}.${createHmac('sha256', status.JWT_SECRET).update(tokenBody).digest('base64url')}`
  const expiredResponse = await fetch(`${url}/rest/v1/activities`, { headers: { apikey: key, Authorization: `Bearer ${expiredToken}` } })
  assert.equal(expiredResponse.status, 401)
  let expire = true
  await page.route('**/rest/v1/activities*', async route => {
    if (route.request().method() === 'POST' && expire) { expire = false; await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST301', message: 'JWT expired' }) }) } else await route.fallback()
  })
  await page.getByLabel('Title', { exact: true }).fill('Expired auth recovery')
  await page.getByLabel('Location', { exact: true }).fill('Local pitch')
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Sign in again', exact: true })).toBeVisible()
  await page.unroute('**/rest/v1/activities*')
  await page.getByRole('link', { name: 'Sign in again', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Phase F Football Club', exact: true })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Activity sync' }).click()
  await page.getByRole('button', { name: 'Sync now', exact: true }).click()
  await expect.poll(async () => good(await a.from('activities').select('id').eq('club_id', club).eq('title', 'Expired auth recovery'), 'auth recovery').length).toBe(1)
  pass('real expired JWT rejected; injected in-flight expiry pauses sync; browser reauthentication resumes persisted record')
  await worker(club)
  // Mobile/tablet/desktop, keyboard and private link flows on actual app.
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 })
    for (const path of ['/', '/opportunities', `/opportunities/${opportunity}`, '/play-proof', '/club-profile', '/club-profile?section=members', '/club-profile?section=documents', '/club-profile?section=settings']) {
      await page.goto(origin + path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      if (path === '/' || path.includes(opportunity)) await expect(page.getByText('Assessment: Up to date', { exact: true })).toBeVisible()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `horizontal overflow at ${width} ${path}`)
      await page.keyboard.press('Tab')
      assert.equal(await page.evaluate(() => document.activeElement !== document.body), true)
      const focus = await page.evaluate(() => { const style = getComputedStyle(document.activeElement); return { width: style.outlineWidth, type: style.outlineStyle, shadow: style.boxShadow } })
      assert.ok((focus.width !== '0px' && focus.type !== 'none') || focus.shadow !== 'none', 'visible keyboard focus')
      if (path === '/' || path.includes(opportunity)) await page.screenshot({ path: `.codex-logs/phase-f-${path === '/' ? 'home' : 'readiness'}-${width}.png`, fullPage: true })
      const unlabelled = await page.locator('input:not([type=hidden]),select,textarea').evaluateAll(nodes => nodes.filter(n => !n.labels?.length && !n.getAttribute('aria-label') && !n.getAttribute('aria-labelledby')).length)
      assert.equal(unlabelled, 0, 'all form fields labelled')
    }
    await page.screenshot({ path: `.codex-logs/phase-f-browser-${width}.png`, fullPage: true })
    pass(`real app layouts at ${width}px, no horizontal overflow, keyboard focus and form labels`)
  }
  // Browser loading/error/empty handling; faults here are explicitly injected.
  let release
  const gate = new Promise(resolve => { release = resolve })
  await page.route('**/rest/v1/rpc/readiness_lifecycle', async route => { await gate; await route.fallback() })
  await page.goto(`${origin}/`)
  await expect(page.getByText('Loading readiness…', { exact: true })).toBeVisible()
  release(); await page.unrouteAll({ behavior: 'wait' })
  await expect(page.getByText('Assessment: Up to date', { exact: true })).toBeVisible()
  await page.route('**/rest/v1/rpc/readiness_lifecycle', route => route.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"Injected local permission failure"}' }))
  await page.getByRole('button', { name: 'Refresh readiness', exact: true }).click()
  await expect(page.getByRole('alert').filter({ hasText: 'Injected local permission failure' })).toBeVisible()
  await page.unroute('**/rest/v1/rpc/readiness_lifecycle')
  await page.goto(`${origin}/opportunities`)
  await page.getByLabel('Search opportunities').fill('no-such-local-opportunity')
  await expect(page.getByText('No opportunities match these filters.')).toBeVisible()
  pass('browser loading and error branches with explicit fault injection; empty search state')
  // Delete physical evidence through existing UI, then reassess actual persistence.
  await page.goto(`${origin}/club-profile?section=documents`)
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm delete', exact: true }).click()
  await expect(page.getByText('Document deleted.', { exact: true })).toBeVisible()
  await worker(club)
  docResult = good(await a.from('readiness_results').select('*').eq('club_id', club).eq('requirement_id', registration).single(), 'deleted evidence result')
  assert.equal(docResult.status, 'not_supplied')
  assert.deepEqual(good(await a.from('readiness_result_evidence').select('*').eq('result_id', docResult.id), 'removed evidence links'), [])
  denied(await a.storage.from('club-evidence').download(evidence.storage_path), 'deleted physical file')
  await page.goto(`${origin}/opportunities/${opportunity}`)
  await expect(page.getByText('Evidence status: Not supplied', { exact: true })).toBeVisible()
  pass('UI physical evidence deletion, worker transition to not_supplied, exact support removal and frontend rendering')
  // Fresh object for revocation tests; cleanup later uses only explicit fixture paths.
  const revokePath = `${club}/${randomUUID()}.pdf`; documents.push(revokePath)
  good(await a.storage.from('club-evidence').upload(revokePath, pdf, { contentType: 'application/pdf' }), 'revocation file')
  good(await a.from('evidence').insert({ club_id: club, uploaded_by: login.user.id, document_type: 'other', file_name: 'revoke.pdf', storage_path: revokePath, mime_type: 'application/pdf', file_size: pdf.length }), 'revocation metadata')
  const signedBefore = good(await a.storage.from('club-evidence').createSignedUrl(revokePath, 60), 'pre-revocation link').signedUrl
  // Save locally offline, revoke, then reconnect: retry must retain local record.
  await page.goto(`${origin}/play-proof`)
  await expect(page.getByRole('heading', { name: 'PlayProof', exact: true })).toBeVisible()
  await page.locator('summary').filter({ hasText: 'Activity sync' }).click()
  await expect(page.getByRole('button', { name: 'Sync now', exact: true })).toBeEnabled()
  await context.setOffline(true)
  await page.getByLabel('Title', { exact: true }).fill('Revoked member retry')
  await page.getByLabel('Location', { exact: true }).fill('Local pitch')
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible()
  sql(`delete from public.club_members where club_id='${club}' and user_id='${login.user.id}'`)
  await context.setOffline(false)
  await expect(page.getByText('Sync failed - retry', { exact: true })).toBeVisible({ timeout: 45000 })
  assert.deepEqual(good(await a.from('activities').select('*').eq('club_id', club), 'revoked activities'), [])
  for (const table of ['readiness_results', 'readiness_result_evidence', 'evidence']) assert.deepEqual(good(await a.from(table).select('*').eq('club_id', club), `revoked ${table}`), [])
  denied(await a.storage.from('club-evidence').download(revokePath), 'revoked document download')
  denied(await a.storage.from('club-evidence').createSignedUrl(revokePath, 60), 'revoked new signed URL')
  denied(await a.rpc('request_readiness_assessment', { p_club: club }), 'revoked reassessment')
  denied(await a.rpc('readiness_lifecycle', { p_club: club }), 'revoked lifecycle')
  assert.equal(sql(`select count(*) from public.activities where club_id='${club}' and title='Revoked member retry'`), '0')
  // Existing signed capabilities remain usable until their TTL. Record, do not
  // misreport this as immediate revocation of previously issued URLs.
  assert.equal((await fetch(signedBefore)).status, 200)
  pass('revoked membership blocks retry/private reads/new signed URLs/RPCs; local failed record retained; prior signed URL lasts until TTL')
  sql(`delete from public.club_members where club_id='${clubB}' and user_id='${signupB.user.id}'`)
  denied(await b.rpc('readiness_lifecycle', { p_club: clubB }), 'second revoked club')
  denied(await b.rpc('request_readiness_assessment', { p_club: clubB }), 'second revoked recompute')
  // Actual local Auth verification endpoints exercise confirmation/recovery callbacks.
  const callbackEmail = `g2a-callback-${randomUUID()}@example.test`
  const confirmation = good(await admin.auth.admin.generateLink({ type: 'signup', email: callbackEmail, password, options: { redirectTo: `${origin}/sign-in` } }), 'local confirmation link')
  users.push(confirmation.user.id)
  await page.evaluate(() => localStorage.clear())
  await page.goto(confirmation.properties.action_link)
  await expect(page).toHaveURL(`${origin}/club-profile`)
  const recoveryLink = good(await admin.auth.admin.generateLink({ type: 'recovery', email: callbackEmail, options: { redirectTo: `${origin}/reset-password` } }), 'local recovery link')
  await page.goto(recoveryLink.properties.action_link)
  await expect(page.getByRole('heading', { name: 'Set a new password', exact: true })).toBeVisible()
  await page.getByLabel('Password', { exact: true }).fill('New-local-password-9284!')
  await page.getByLabel('Confirm password', { exact: true }).fill('New-local-password-9284!')
  await page.getByRole('button', { name: 'Set a new password', exact: true }).click()
  await expect(page.getByText('Your password has been updated. You can continue to your club.', { exact: true })).toBeVisible()
  const callbackClient = client()
  good(await callbackClient.auth.signInWithPassword({ email: callbackEmail, password: 'New-local-password-9284!' }), 'updated callback password')
  pass('real local email confirmation callback and recovery callback/password update')
  assert.deepEqual(pageErrors, [], 'browser runtime errors')
  console.log(`PASS ${checks} integration groups completed; no hosted calls; real services and injected failures identified above`)
} catch (error) {
  console.error('INTEGRATION FAILURE:', error.message)
  if (page) await page.screenshot({ path: '.codex-logs/phase-f-browser-failure.png', fullPage: true }).catch(() => {})
  throw error
} finally {
  if (context) await context.close()
  if (browser) await browser.close()
  if (server) await server.close()
  // Explicit bounded test-fixture cleanup, never an orphan-discovery/deletion job.
  if (documents.length) good(await admin.storage.from('club-evidence').remove(documents), 'fixture document cleanup')
  if (media.length) good(await admin.storage.from('activity-media').remove(media), 'fixture media cleanup')
  for (const club of clubs) sql(`delete from public.activity_attachments where activity_id in(select id from public.activities where club_id='${club}'); delete from public.activities where club_id='${club}'; delete from public.clubs where id='${club}'`)
  sql(`delete from public.opportunities where id='${opportunity}'`)
  for (const user of users) sql(`delete from auth.users where id='${user}'`)
  for (const c of clients) await c.auth.signOut()
}
