import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useClub } from '../../hooks/useClub'
import { useAuth } from '../../hooks/useAuth'
import { message } from '../../services/supabase'
import { getOpportunity, sourceLink, type CatalogueOpportunity } from '../../services/opportunities'
import { OpportunityBadge } from './index'
import { RuleSource } from './Readiness'
import Readiness from '../../components/Readiness'
import { availability } from '../../services/opportunity-assessment'

export default function OpportunityDetail() {
  const { id = '' } = useParams()
  const { selection } = useClub()
  const { session } = useAuth()
  if (!selection || !session) return null
  return <Detail key={`${id}:${selection.club.id}:${session.user.id}:${selection.membership.role}`} id={id} clubId={selection.club.id} userId={session.user.id} />
}
function Detail({ id, clubId, userId }: { id: string; clubId: string; userId: string }) {
  const [data, setData] = useState<{ opportunity: CatalogueOpportunity | null; } | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    getOpportunity(id).then(opportunity => { if (active) setData({ opportunity }) }).catch(failure => { if (active) setError(message(failure)) })
    return () => { active = false }
  }, [id, clubId, userId, attempt])
  function retry() { setError(''); setData(null); setAttempt(value => value + 1) }
  const opportunity = data?.opportunity
  return <section className="panel mx-auto max-w-3xl">
    <Link className="text-sm text-accent-readable underline" to="/opportunities">Back to opportunities</Link>
    {error ? <div role="alert" className="mt-6 text-ink">{error} <button className="underline" onClick={retry}>Retry</button></div> : !data ? <p role="status" className="mt-4 text-sm text-ink">Loading opportunity…</p> : !opportunity ? <h1 className="mt-6 text-2xl font-bold">Opportunity not found</h1> : <>
      <div className="mt-6"><OpportunityBadge opportunity={opportunity} /></div>
      <h1 className="page-title mt-4 break-words">{opportunity.title}</h1>
      <p className="mt-2 text-muted">{opportunity.organiser} · Reviewed {opportunity.review_date}</p>
      <p className="mt-5 whitespace-pre-wrap break-words">{opportunity.description || 'Description unavailable. Consult the official source.'}</p>
      <p className="mt-4">{opportunity.deadline ? `Published deadline: ${new Date(opportunity.deadline).toLocaleString()} (your local time)` : 'Deadline not confirmed; consult the source.'}</p>
      <p className="mt-3"><External href={opportunity.source_url}>Original source</External></p>
      {(opportunity.status === 'historical' || opportunity.status === 'closed') && <p className="mt-4 rounded-lg bg-canvas p-3 text-ink">Historical criteria — recheck the next call.</p>}
      {opportunity.slug === 'safaricom-chapa-dimba-2026' && <p className="mt-4 rounded-lg bg-canvas p-3 text-ink">Player identity and parental consent documents must be submitted directly to the organiser. ClubReady does not collect them. Use aggregate team counts only.</p>}
      {opportunity.notes?.length ? <ul className="mt-4 list-inside list-disc space-y-2 text-sm text-muted">{opportunity.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
      {opportunity.sources?.map((source, index) => <RuleSource key={index} source={source} />)}
      <h2 className="mt-10 text-xl font-bold">How to apply</h2><p className="mt-2 whitespace-pre-wrap break-words">{opportunity.application_method || 'Application instructions are unavailable. Consult the official source below.'}</p>
      {availability(opportunity) === 'open' && opportunity.application_url && <p className="mt-3"><External href={opportunity.application_url}>Application website</External></p>}
      {opportunity.application_steps?.length ? <ol className="mt-4 list-inside list-decimal space-y-3">{opportunity.application_steps.map(step => <li key={step.order}>{step.text}<RuleSource source={step.source} /></li>)}</ol> : null}
      <Readiness clubId={clubId} opportunityId={id} />

    </>}
  </section>
}
function External({ href, children }: { href: string; children: React.ReactNode }) {
  const safe = sourceLink(href)
  return safe ? <a className="text-accent-readable underline" href={safe} target="_blank" rel="noopener noreferrer">{children}<span className="sr-only"> (opens in a new tab)</span></a> : <span>Source link unavailable</span>
}