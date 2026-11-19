import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { evidenceStatus, lifecycleLabels, requestAssessment, loadReadiness, statusLabels, type ReadinessSnapshot } from '../services/readiness'
import { subscribeReadiness } from '../services/readiness-events'
import { documentUrl } from '../services/documents'
import { message } from '../services/supabase'
import { documentTypes, type Evidence } from '../types/club'

function DocumentLink({ document }: { document: Evidence }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (!url) return; const timer = setTimeout(() => setUrl(''), 55_000); return () => clearTimeout(timer) }, [url])
  return <li className="break-words">Document: {url ? <a className="text-link" href={url} target="_blank" rel="noopener noreferrer">{document.file_name}</a> : <button className="text-link min-h-11" onClick={() => { setError(''); void documentUrl(document).then(setUrl).catch(failure => setError(message(failure))) }}>Open {document.file_name}</button>}{error && <span role="alert"> {error}</span>}</li>
}
export default function Readiness({ clubId, opportunityId }: { clubId: string; opportunityId?: string }) {
  // Remount on scope changes so previous-club data can never flash during an effect.
  return <ScopedReadiness key={`${clubId}:${opportunityId || ''}`} clubId={clubId} opportunityId={opportunityId} />
}
function ScopedReadiness({ clubId, opportunityId }: { clubId: string; opportunityId?: string }) {
  const [snapshot, setSnapshot] = useState<ReadinessSnapshot | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [requesting, setRequesting] = useState(false)
  useEffect(() => {
    let active = true
    let request = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let polls = 0
    const load = () => {
      const current = ++request
      clearTimeout(timer)
      setSnapshot(null); setError('')
      void loadReadiness(clubId, opportunityId).then(data => {
        if (!active || current !== request) return
        setSnapshot(data)
        if ((['queued', 'processing', 'stale'].includes(data.lifecycle.state) || data.consistent === false) && polls < 120) {
          polls++
          timer = setTimeout(load, 5000)
        }
      }).catch(failure => { if (active && current === request) setError(message(failure)) })
    }
    const unsubscribe = subscribeReadiness(changedClub => {
      if (changedClub !== clubId) return
      polls = 0; load()
    })
    load()
    return () => { active = false; unsubscribe(); clearTimeout(timer) }
  }, [clubId, opportunityId, attempt])
  async function reassess() {
    if (requesting) return
    setRequesting(true); setNotice('')
    try {
      const ack = await requestAssessment(clubId)
      setNotice(ack.accepted ? 'Assessment requested. Reassessment may take time.' : `Assessment request rate limited. Try again in ${ack.retry_after_seconds} seconds.`)
      setAttempt(value => value + 1)
    } catch (failure) { setNotice(`Could not request assessment: ${message(failure)}`) }
    finally { setRequesting(false) }
  }
  const rows = snapshot?.rows || []
  const statusFor = (row: (typeof rows)[number]) => snapshot?.lifecycle.state === 'up_to_date' && snapshot.consistent !== false ? evidenceStatus(row) : 'unknown'
  return <section className="mt-8 border-t border-border pt-6 min-w-0" aria-label="Evidence readiness">
    <h2 className="text-xl font-bold">{opportunityId ? 'Requirements and Club Evidence' : 'Evidence readiness'}</h2>
    <p className="mt-2 text-sm text-muted">Supplied evidence is not verified eligibility or organiser approval.</p>

    {snapshot && <p role="status" className="mt-3 text-sm">Assessment: {lifecycleLabels[snapshot.lifecycle.state]}{['queued', 'processing'].includes(snapshot.lifecycle.state) && '. Your readiness assessment is being updated. Refresh later if it remains pending.'}</p>}
    {snapshot?.consistent === false && <p className="mt-3 text-sm">Assessment changed while loading. Refresh readiness to reload its evidence.</p>}
    {notice && <p role="status" className="mt-3 text-sm">{notice}</p>}
    <button className="text-link min-h-11 mt-2 mr-5" disabled={requesting} onClick={() => void reassess()}>{requesting ? 'Requesting assessment…' : 'Refresh assessment'}</button>
    <button className="text-link min-h-11 mt-2" onClick={() => setAttempt(value => value + 1)}>Refresh readiness</button>
    {error ? <p role="alert">Could not load readiness: {error}</p> : !snapshot ? <p role="status">Loading readiness…</p> : <>
      {!rows.length ? <p>No current requirements are available for assessment.</p> : <>
        <p className="mt-4 text-sm">Last successful club assessment: {snapshot.lifecycle.last_assessed_at ? new Date(snapshot.lifecycle.last_assessed_at).toLocaleString() : 'Never assessed'}</p>
        {opportunityId && <ul className="mt-4 divide-y divide-border">{rows.map(row => <li key={row.requirement.id} className="py-4 break-words min-w-0">
          <h3 className="font-semibold">{row.requirement.description}</h3>
          <p className="mt-2 text-sm whitespace-pre-wrap">{row.requirement.source_note}</p>
          <p className="mt-2">Evidence status: {row.mapping && row.mapping.mapping_type !== 'unsupported' && (['queued', 'processing', 'stale'].includes(snapshot.lifecycle.state) || snapshot.consistent === false) ? 'Updating' : statusLabels[statusFor(row)]}</p>
          <p className="text-sm">Applicability: {snapshot.lifecycle.state === 'up_to_date' && snapshot.consistent !== false ? row.assessment?.applicability.replaceAll('_', ' ') || 'unknown' : 'unknown'}{row.requirement.condition && ' · Conditional; requires review'} · {row.requirement.required === false ? 'Optional' : 'Required'}</p>
          <p className="mt-2 text-sm">Evidence type: {row.requirement.document_type ? documentTypes[row.requirement.document_type] : row.mapping?.mapping_type === 'activity' ? `PlayProof activity${row.mapping.activity_type ? ` · ${row.mapping.activity_type}` : ''}` : row.requirement.requirement_type.replaceAll('_', ' ')}</p>
          {!row.mapping || row.mapping.mapping_type === 'unsupported' ? <p className="mt-2 text-sm">Readiness assessment not available for this requirement.</p> : null}
          <p className="text-sm">Last assessed: {row.assessment?.evaluated_at ? <time dateTime={row.assessment.evaluated_at}>{new Date(row.assessment.evaluated_at).toLocaleString()}</time> : 'Never assessed'}</p>
          <ul className="mt-2 text-sm">{row.documents.map(document => <DocumentLink key={document.id} document={document} />)}{row.activities.map(activity => <li key={activity.id}>Activity: <Link className="text-link min-h-11 inline-flex items-center" to={`/play-proof?activity=${encodeURIComponent(activity.id)}`}>{activity.title}</Link> · {activity.date} · {activity.activity_type}</li>)}</ul>
          {row.documents.length > 0 && <p className="mt-2 text-sm text-muted">Uploaded by the club. Not independently verified.</p>}
          {statusFor(row) === 'not_supplied' && row.mapping?.mapping_type === 'activity' && <Link className="text-link min-h-11 inline-flex items-center" to="/play-proof">Record an activity in PlayProof</Link>}
          {statusFor(row) === 'not_supplied' && row.mapping?.mapping_type === 'document' && <Link className="text-link min-h-11 inline-flex items-center" to="/club-profile?section=documents">Upload a supporting document</Link>}
          {!row.documents.length && !row.activities.length && <p className="mt-2 text-sm text-muted">No linked supporting documents or activities.</p>}
        </li>)}</ul>}
      </>}
    </>}
  </section>
}
