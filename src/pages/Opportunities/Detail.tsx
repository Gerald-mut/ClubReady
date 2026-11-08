import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClub } from '../../hooks/useClub'
import { useAuth } from '../../hooks/useAuth'
import { listDocuments } from '../../services/documents'
import { listActivities } from '../../db/offline'
import { documentTypes, type Evidence } from '../../types/club'
import { message } from '../../services/supabase'
import { getOpportunity, getTracking, listRequirements, listRules, saveTracking, sourceLink, trackingStatuses, type CatalogueOpportunity, type Requirement, type Tracking, type TrackingStatus } from '../../services/opportunities'
import { OpportunityBadge } from './index'
import Readiness, { RuleSource } from './Readiness'
import ReadinessPreview from './ReadinessPreview'
import { availability, type EligibilityRule } from '../../services/opportunity-assessment'

export default function OpportunityDetail() {
  const { id = '' } = useParams()
  const { selection } = useClub()
  const { session } = useAuth()
  if (!selection || !session) return null
  return <Detail key={`${id}:${selection.club.id}:${session.user.id}:${selection.membership.role}`} id={id} clubId={selection.club.id} clubName={selection.club.name} userId={session.user.id} admin={selection.membership.role === 'club_admin'} />
}
function Detail({ id, clubId, clubName, userId, admin }: { id: string; clubId: string; clubName: string; userId: string; admin: boolean }) {
  const [data, setData] = useState<{ opportunity: CatalogueOpportunity | null; requirements: Requirement[]; tracking: Tracking | null; rules: EligibilityRule[] } | null>(null)
  const [evidence, setEvidence] = useState<{ documents: Evidence[]; activityCount: number } | null>(null)
  const [error, setError] = useState('')
  const [evidenceError, setEvidenceError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    Promise.all([getOpportunity(id), listRequirements(id), getTracking(clubId, id), listRules(id)]).then(([opportunity, requirements, tracking, rules]) => { if (active) setData({ opportunity, requirements, tracking, rules }) }).catch(failure => { if (active) setError(message(failure)) })
    Promise.all([listDocuments(clubId), listActivities(userId, clubId)]).then(([documents, activities]) => { if (active) setEvidence({ documents, activityCount: activities.length }) }).catch(failure => { if (active) setEvidenceError(message(failure)) })
    return () => { active = false }
  }, [id, clubId, userId, attempt])
  function retry() { setError(''); setEvidenceError(''); setData(null); setEvidence(null); setAttempt(value => value + 1) }
  const opportunity = data?.opportunity
  return <section className="panel mx-auto max-w-3xl">
    <Link className="text-sm text-accent-readable underline" to="/opportunities">Back to opportunities</Link>
    {error ? <div role="alert" className="mt-6 text-ink">{error} <button className="underline" onClick={retry}>Retry</button></div> : !data ? <p role="status" className="mt-4 text-sm text-ink">Loading opportunity…</p> : !opportunity ? <h1 className="mt-6 text-2xl font-bold">Opportunity not found</h1> : <>
      <div className="mt-6"><OpportunityBadge opportunity={opportunity} /></div>
      <h1 className="page-title mt-4 break-words">{opportunity.title}</h1>
      <p className="mt-2 text-muted">{opportunity.organiser} · Reviewed {opportunity.review_date}</p>
      <p className="mt-5 whitespace-pre-wrap break-words">{opportunity.description}</p>
      <p className="mt-4">{opportunity.deadline ? `Published deadline: ${new Date(opportunity.deadline).toLocaleString()} (your local time)` : 'Deadline not confirmed; consult the source.'}</p>
      <p className="mt-3"><External href={opportunity.source_url}>Original source</External></p>
      <p className="mt-3 text-sm">Cycle: {opportunity.cycle || 'Not confirmed'} · Scope: {(opportunity.geographic_scope || []).join(', ') || 'Check source'}</p>
      <p className="mt-2">Target applicants: {(opportunity.target_applicants || []).join('; ') || 'Consult the official criteria'}</p>
      {opportunity.amount && <p className="mt-2">Published funding ({opportunity.cycle}): {opportunity.amount.currency} {opportunity.amount.max?.toLocaleString()} · {opportunity.amount.note}</p>}
      {(opportunity.status === 'historical' || opportunity.status === 'closed') && <p className="mt-4 rounded-lg bg-canvas p-3 text-ink">Historical criteria — recheck the next call.</p>}
      {opportunity.slug === 'safaricom-chapa-dimba-2026' && <p className="mt-4 rounded-lg bg-canvas p-3 text-ink">Player identity and parental consent documents must be submitted directly to the organiser. ClubReady does not collect them. Use aggregate team counts only.</p>}
      {opportunity.notes?.length ? <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted">{opportunity.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      {opportunity.sources?.map((source, index) => <RuleSource key={index} source={source} />)}
      <h2 className="mt-10 text-xl font-bold">How to apply</h2><p className="mt-2 whitespace-pre-wrap break-words">{opportunity.application_method}</p>
      {availability(opportunity) === 'open' && opportunity.application_url && <p className="mt-3"><External href={opportunity.application_url}>Application website</External></p>}
      {opportunity.application_steps?.length ? <ol className="mt-4 list-inside list-decimal space-y-3">{opportunity.application_steps.map(step => <li key={step.order}>{step.text}<RuleSource source={step.source} /></li>)}</ol> : null}
      <h2 className="mt-10 text-xl font-bold">Requirements and supplied information</h2>
      <p className="mt-2 text-muted">Comparing {clubName}. Document counts include the club’s supplied evidence. Activity counts cover your records saved on this device for this club, not other members or devices.</p>
      <p className="mt-2 text-sm text-muted">“Supplied” describes presence only. Categories and counts cannot establish that a requirement is met. Read conditions, dates and source notes. Requirements without a matching evidence category need separate review.</p>
      {evidenceError ? <div role="alert" className="mt-4 text-ink">Could not load supplied information: {evidenceError} <button className="underline" onClick={retry}>Retry</button></div> : !evidence ? <p role="status" className="mt-4 text-sm text-ink">Loading supplied information…</p> : <>
        <Readiness rules={data.rules} requirements={data.requirements} documents={evidence.documents} />
        <p className="mt-4 text-sm font-medium">Your local activity records: {evidence.activityCount}</p>
        {data.requirements.length ? <div className="mt-4 max-w-full overflow-x-auto"><table className="w-full text-left text-sm"><caption className="sr-only">Published requirements beside your club’s supplied information</caption><thead><tr className="border-b border-border"><th scope="col" className="min-w-48 p-3">Published requirement</th><th scope="col" className="min-w-48 p-3">Supplied information</th></tr></thead><tbody>{data.requirements.map(requirement => {
          const count = requirement.document_type ? evidence.documents.filter(document => document.document_type === requirement.document_type).length : requirement.requirement_type === 'activity' ? evidence.activityCount : 0
          const category = requirement.document_type ? documentTypes[requirement.document_type] : requirement.requirement_type === 'activity' ? 'Your local activity records' : 'No automatic category match'
          return <tr key={requirement.id} className="border-b border-border align-top"><td className="p-3"><p className="whitespace-pre-wrap break-words">{requirement.description}</p><p className="mt-2 text-xs text-muted">Version {requirement.version} · Reviewed {opportunity.review_date}{requirement.min_count !== null ? ` · Published minimum: ${requirement.min_count}` : ''}</p><p className="mt-2 whitespace-pre-wrap break-words text-xs text-muted">{requirement.source_note}</p><p className="mt-2"><External href={sourceFromNote(requirement.source_note) || opportunity.source_url}>Requirement source</External></p></td><td className="p-3"><strong>{count > 0 ? 'Supplied' : 'Not supplied'}</strong><p className="mt-2">{category}{requirement.document_type || requirement.requirement_type === 'activity' ? `: ${count}` : ''}</p>{requirement.requirement_type === 'activity' && <p className="mt-2 text-xs text-muted">A count does not establish sport, frequency or programme duration.</p>}</td></tr>
        })}</tbody></table></div> : <p className="mt-4">No current requirements have been published.</p>}
      </>}
      <ReadinessPreview clubId={clubId} opportunityId={id} admin={admin} />
      <TrackingControl key={data.tracking?.id || 'new'} clubId={clubId} opportunityId={id} initial={data.tracking} admin={admin} />
    </>}
  </section>
}
function sourceFromNote(note: string) { return note.match(/^https:\/\/\S+/)?.[0] }
function External({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = sourceLink(href)
  return safe ? <a className="text-accent-readable underline" href={safe} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a> : <span>Source link unavailable</span>
}
function TrackingControl({ clubId, opportunityId, initial, admin }: { clubId: string; opportunityId: string; initial: Tracking | null; admin: boolean }) {
  const [status, setStatus] = useState<TrackingStatus>(initial?.status || 'not_started')
  const [notes, setNotes] = useState(initial?.notes || '')
  const [saved, setSaved] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!admin || busy) return
    setBusy(true); setError(''); setNotice('')
    try { const row = await saveTracking(clubId, opportunityId, status, notes); setSaved(row); setStatus(row.status); setNotes(row.notes || ''); setNotice('Application tracking saved.') }
    catch (failure) { setError(message(failure)) }
    finally { setBusy(false) }
  }
  return <section className="mt-8 border-t border-border pt-6"><h2 className="text-xl font-bold">Application tracking</h2><p className="mt-2 text-sm text-muted">For your club’s own records, including historical examples. Saving does not submit an application.</p>
    {admin ? <form className="mt-4 grid max-w-xl gap-4" onSubmit={event => void submit(event)}>
      <label className="field">Application status<select disabled={busy} value={status} onChange={event => setStatus(event.target.value as TrackingStatus)}>{Object.entries(trackingStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Application notes<textarea maxLength={10000} rows={4} disabled={busy} value={notes} onChange={event => setNotes(event.target.value)} /></label>
      <button className="button justify-self-start" disabled={busy}>{busy ? 'Saving…' : 'Save tracking'}</button>
    </form> : <div className="mt-4"><p>Application status: <strong>{trackingStatuses[status]}</strong></p><p className="mt-2 whitespace-pre-wrap break-words">{notes || 'No notes added.'}</p><p className="mt-2 text-sm text-muted">Only club administrators can update tracking.</p></div>}
    {saved && <p className="mt-3 text-sm text-muted">Last updated {new Date(saved.updated_at).toLocaleString()}</p>}
    {error && <p role="alert" className="mt-3 text-ink">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-ink">{notice}</p>}
  </section>
}
