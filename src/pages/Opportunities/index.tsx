import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { listOpportunities, type CatalogueOpportunity } from '../../services/opportunities'
import { message } from '../../services/supabase'
import { availability, availabilityLabels } from '../../services/opportunity-assessment'

const typeLabels = { government_grant: 'Government grant', foundation_grant: 'Foundation grant', tournament: 'Tournament', fundraising_platform: 'Fundraising platform' } as const

export function OpportunityBadge({ opportunity }: { opportunity: CatalogueOpportunity }) {
  const status = availability(opportunity)
  return <div className="flex flex-wrap gap-2 text-sm"><span className="status-label">{availabilityLabels[status]}</span>{opportunity.is_demonstration && <strong className="status-label">Demonstration only</strong>}</div>
}
export default function Opportunities() {
  const { session } = useAuth()
  return <Catalogue key={session?.user.id} />
}
function Catalogue() {
  const [rows, setRows] = useState<CatalogueOpportunity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [filters, setFilters] = useState({ type: '', status: '', country: '', search: '' })
  const [page, setPage] = useState(1)
  function filter(field: keyof typeof filters, value: string) { setFilters(previous => ({ ...previous, [field]: value })); setPage(1) }
  const filtered = rows.filter(row => (!filters.type || row.opportunity_type === filters.type) && (!filters.status || availability(row) === filters.status) && (!filters.country || row.geographic_scope?.includes(filters.country)) && `${row.title} ${row.organiser} ${row.description}`.toLowerCase().includes(filters.search.trim().toLowerCase()))
  const visible = filtered.slice((page - 1) * 6, page * 6)
  useEffect(() => {
    let active = true
    listOpportunities().then(data => { if (active) { setRows(data); setLoading(false) } }).catch(failure => { if (active) { setError(message(failure)); setLoading(false) } })
    return () => { active = false }
  }, [attempt])
  return <section className="panel">
    <p className="eyebrow">Published requirements</p>
    <h1 className="page-title mt-3">Opportunities</h1>
    <p className="mt-3 max-w-2xl text-muted">Explore published requirements and compare them with your club’s supplied information. Check the original source before applying.</p>
    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <label className="field">Search opportunities<input type="search" value={filters.search} onChange={event => filter('search', event.target.value)} /></label>
      <label className="field">Opportunity type<select value={filters.type} onChange={event => filter('type', event.target.value)}><option value="">All types</option>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Availability<select value={filters.status} onChange={event => filter('status', event.target.value)}><option value="">All statuses</option>{Object.entries(availabilityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Country / scope<select value={filters.country} onChange={event => filter('country', event.target.value)}><option value="">All countries</option>{[...new Set(rows.flatMap(row => row.geographic_scope || []))].sort().map(country => <option key={country} value={country}>{country === 'KE' ? 'Kenya' : country === 'international' ? 'International' : country}</option>)}</select></label>
    </div>
    {loading && <p role="status" className="mt-6">Loading opportunities…</p>}
    {error && <div role="alert" className="mt-6 text-ink">{error} <button className="underline" onClick={() => { setLoading(true); setError(''); setAttempt(value => value + 1) }}>Retry</button></div>}
    {!loading && !error && (filtered.length ? <ul className="mt-8 grid gap-5 md:grid-cols-2">{visible.map(row => <li key={row.id} className="card">
      <OpportunityBadge opportunity={row} />
      <p className="mt-3 text-sm font-medium">{row.opportunity_type ? typeLabels[row.opportunity_type] : 'Grant'} · {(row.geographic_scope || []).join(', ')} {row.cycle ? `· Cycle ${row.cycle}` : '· Cycle not confirmed'}</p>
      <h2 className="mt-4 text-xl font-semibold"><Link className="inline-flex min-h-11 items-center text-ink" to={`/opportunities/${row.id}`}>{row.title}</Link></h2>
      <p className="mt-2 text-sm text-muted">{row.organiser} · Reviewed {row.review_date}
      <span className="block">Official source review: {row.last_verified_at || 'Needs verification'}</span></p>
      <p className="mt-3 whitespace-pre-wrap break-words text-muted">{row.description}</p>
      <p className="mt-4 text-sm">{row.deadline ? `Published deadline: ${new Date(row.deadline).toLocaleString()} (your local time)` : 'Deadline not confirmed; consult the source.'}</p>
    </li>)}</ul> : <p className="mt-6">{rows.length ? 'No opportunities match these filters.' : 'No opportunities have been published yet.'}</p>)}
    {!loading && !error && filtered.length > 6 && <nav aria-label="Catalogue pages" className="mt-5 flex items-center gap-4"><button className="button" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Previous page</button><span>Page {page} of {Math.ceil(filtered.length / 6)}</span><button className="button" disabled={page * 6 >= filtered.length} onClick={() => setPage(value => value + 1)}>Next page</button></nav>}
  </section>
}
