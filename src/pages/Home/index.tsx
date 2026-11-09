import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useClub } from '../../hooks/useClub'
import { useAuth } from '../../hooks/useAuth'
import { listActivities } from '../../db/offline'
import { listDocuments } from '../../services/documents'
import { listOpportunities, type CatalogueOpportunity } from '../../services/opportunities'
import { message } from '../../services/supabase'
import { OpportunityBadge } from '../Opportunities'
import { SectionHeading, StatCard } from '../../components/ui'
import Icon from '../../components/Icons'
import Readiness from '../../components/Readiness'
export default function Home() {
  const { selection } = useClub(); const { session } = useAuth()
  if (!selection || !session) return null
  return <Overview key={`${selection.club.id}:${session.user.id}:${selection.membership.role}`} club={selection.club} userId={session.user.id} />
}
function Overview({ club, userId }: { club: NonNullable<ReturnType<typeof useClub>['selection']>['club']; userId: string }) {
  const [stats, setStats] = useState<{ activities: number; documents: number } | null>(null)
  const [rows, setRows] = useState<CatalogueOpportunity[] | null>(null)
  const [statsError, setStatsError] = useState(''); const [catalogueError, setCatalogueError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    Promise.all([listActivities(userId, club.id), listDocuments(club.id)]).then(([activities, documents]) => { if (active) setStats({ activities: activities.length, documents: documents.length }) }).catch(error => { if (active) setStatsError(message(error)) })
    listOpportunities().then(data => { if (active) setRows(data.slice(0, 2)) }).catch(error => { if (active) setCatalogueError(message(error)) })
    return () => { active = false }
  }, [club.id, userId, attempt])
  function retry() { setStatsError(''); setCatalogueError(''); setAttempt(value => value + 1) }
  return <div className="mx-auto max-w-2xl space-y-8 sm:space-y-10">
    <section><p className="eyebrow">Your club, moving forward</p><h1 className="page-title mt-3 break-words">{club.name}{/[.!?]$/.test(club.name) ? '' : '.'}</h1><p className="mt-3 text-sm text-muted">{club.county}{club.sub_county ? ` · ${club.sub_county}` : ''}{club.year_established ? ` · Est. ${club.year_established}` : ''}</p></section>
    <section aria-label="Club statistics"><div className="grid grid-cols-2 gap-3 sm:gap-4"><StatCard value={stats ? stats.activities : '—'} label="Your local activities" /><StatCard value={stats ? stats.documents : '—'} label="Club documents supplied" /></div>{!stats && !statsError && <p role="status" className="mt-3 text-xs text-muted">Loading club statistics…</p>}{statsError && <p role="alert" className="mt-3 text-sm">Could not load statistics: {statsError} <button className="text-link" onClick={retry}>Retry statistics</button></p>}<p className="mt-3 text-xs text-muted">Activities cover your records on this device. Documents show presence only.</p></section>
    <Readiness clubId={club.id} />
    <section className="feature-card"><p className="eyebrow">PlayProof</p><h2 className="mt-4 max-w-sm text-3xl font-bold tracking-tight sm:text-4xl">Every match tells a story.</h2><p className="mt-4 max-w-md text-sm leading-relaxed">Keep a record of the training, tournaments and moments that move your club forward.</p><Link className="button mt-6" to="/play-proof">Record an activity <Icon name="arrow" size={18} /></Link></section>
    <section><SectionHeading title="Opportunities" href="/opportunities" />
      {catalogueError ? <p role="alert" className="mt-4 text-sm">Could not load opportunities: {catalogueError} <button className="text-link" onClick={retry}>Retry opportunities</button></p> : !rows ? <p role="status" className="mt-4 text-sm text-muted">Loading opportunities…</p> : rows.length ? <ul className="mt-4 space-y-3">{rows.map(row => <li key={row.id} className="card"><OpportunityBadge opportunity={row} /><h3 className="mt-4 text-lg font-bold"><Link className="inline-flex min-h-11 items-center gap-3" to={`/opportunities/${row.id}`}>{row.title}<Icon name="arrow" size={18} /></Link></h3><p className="mt-1 text-sm text-muted">{row.organiser}{row.cycle ? ` · ${row.cycle}` : ''}</p><p className="mt-3 text-xs text-muted">{row.deadline ? `Published deadline: ${new Date(row.deadline).toLocaleDateString()}` : 'Deadline not confirmed; consult the source.'}</p></li>)}</ul> : <p className="mt-4 text-sm text-muted">No opportunities have been published yet.</p>}
    </section>
  </div>
}
