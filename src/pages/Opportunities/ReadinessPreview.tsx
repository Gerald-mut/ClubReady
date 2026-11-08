import { useEffect, useRef, useState } from 'react'
import { readinessPreview, type ReadinessAdapter, type ReadinessSnapshot, type ReadinessStatus } from '../../services/readiness-preview'
import { message } from '../../services/supabase'

const labels: Record<ReadinessStatus, string> = { supplied: 'Supplied', not_supplied: 'Not supplied', expiring: 'Expiring', expired: 'Expired' }
const colors: Record<ReadinessStatus, string> = { supplied: 'bg-canvas text-ink', not_supplied: 'bg-canvas text-ink', expiring: 'bg-canvas text-ink', expired: 'bg-canvas text-ink' }
export default function ReadinessPreview({ clubId, opportunityId, admin, adapter = readinessPreview }: { clubId: string; opportunityId: string; admin: boolean; adapter?: ReadinessAdapter }) {
  const [open, setOpen] = useState(false)
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revision = useRef(0)
  const pending = useRef(false)
  useEffect(() => () => { revision.current++ }, [])
  async function run(recompute = false) {
    if (pending.current || (recompute && !admin)) return
    pending.current = true
    const current = ++revision.current
    setBusy(true); setError(''); setOpen(true)
    try {
      const scope = { clubId, opportunityId }
      const next = await (recompute ? adapter.recompute(scope) : adapter.load(scope))
      if (current === revision.current) setSnapshot(next)
    } catch (failure) { if (current === revision.current) setError(message(failure)) }
    finally { if (current === revision.current) { setBusy(false); pending.current = false } }
  }
  return <section className="mt-8 rounded-xl border border-border p-4 sm:p-6" aria-label="Readiness preview">
    <h2 className="text-xl font-bold">Readiness preview</h2>
    <p className="mt-2 text-sm text-ink">Fictional sample data for preview only. These requirements and supporting items do not describe this club or opportunity. Backend integration is pending; nothing is saved.</p>
    {!open ? <button className="button mt-4" onClick={() => void run()}>Open sample assessment</button> : <>
      {busy && <p role="status" className="mt-4">Assessing sample requirements…</p>}
      {error && <div role="alert" className="mt-4 text-ink">Could not assess sample requirements: {error} <button className="underline" disabled={busy} onClick={() => void run()}>Retry sample assessment</button></div>}
      {snapshot && <>
        <p className="mt-4 font-semibold">{snapshot.results.filter(row => row.status === 'supplied').length} of {snapshot.results.length} sample requirements supplied</p>
        <p className="mt-2 text-sm text-muted">Presence summary only; organiser review still applies. Expiring items are shown separately from supplied items in this preview.</p>
        <p className="mt-2 text-sm">Last assessed (sample): <time dateTime={snapshot.assessedAt}>{new Date(snapshot.assessedAt).toLocaleString()}</time>{error && ' · Previous sample assessment retained'}</p>
        {snapshot.results.length ? <ul className="mt-4 space-y-3">{snapshot.results.map(row => <li key={row.id} className="rounded-lg border border-border p-4">
          <div className="flex flex-wrap items-center gap-3"><h3 className="font-semibold">{row.description}</h3><span className={`rounded-full px-3 py-1 text-sm ${colors[row.status]}`}>{labels[row.status]}</span></div>
          <p className="mt-2 text-sm">{row.reason}</p><p className="mt-1 text-xs text-muted">Sample requirement version {row.requirementsVersion}</p>
          {row.support.length ? <ul className="mt-2 list-inside list-disc text-sm">{row.support.map(item => <li key={`${item.kind}:${item.id}`}>{item.kind === 'document' ? 'Document' : 'Activity'}: {item.label} (sample)</li>)}</ul> : <p className="mt-2 text-sm">No supporting sample items.</p>}
        </li>)}</ul> : <p className="mt-4">No sample requirements to assess.</p>}
      </>}
      {admin ? <><button className="button mt-4" disabled={busy} onClick={() => void run(true)}>Recompute sample assessment</button><p className="mt-2 text-sm text-muted">Simulates adding a tournament activity. No real activity is created.</p></> : <p className="mt-4 text-sm text-muted">Only club administrators can recompute the sample assessment.</p>}
    </>}
  </section>
}
