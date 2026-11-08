import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Evidence } from '../../types/club'
import type { Requirement } from '../../services/opportunities'
import { sourceLink } from '../../services/opportunities'
import { assessOpportunity, factFields, fieldsFor, validFact, type EligibilityRule, type FactKey, type Facts, type SourceReference } from '../../services/opportunity-assessment'

const eligibilityLabels = { ineligible: 'Ineligible under the supplied answers', potentially_eligible: 'Potentially eligible — organiser review required', insufficient_information: 'Insufficient information', manual_review_required: 'Manual review required' }
export function RuleSource({ source }: { source?: SourceReference | null }) {
  const href = sourceLink(source?.url || null)
  return <p className="mt-2 text-xs text-muted">{source?.publisher} {source?.cycle ? `· ${source.cycle}` : ''} · {source?.exact_location || source?.title} · {source?.verified_at ? `Source reviewed ${source.verified_at}` : 'Needs verification'} {href && <a className="text-accent-readable underline" href={href} target="_blank" rel="noopener noreferrer">Official rule source</a>}</p>
}
export default function Readiness({ rules, requirements, documents }: { rules: EligibilityRule[]; requirements: Requirement[]; documents: Evidence[] }) {
  const [facts, setFacts] = useState<Facts>({})
  const fields = [...new Set([...rules.flatMap(rule => fieldsFor(rule.expression)), ...requirements.flatMap(row => row.condition ? fieldsFor(row.condition) : [])])]
  const result = assessOpportunity(rules, requirements, facts, documents)
  function change(field: FactKey, raw: string) {
    setFacts(previous => {
      const next = { ...previous }
      const value = raw === '' ? undefined : factFields[field][1] === 'boolean' ? raw === 'true' : Number(raw)
      if (validFact(field, value)) next[field] = value as boolean | number
      else delete next[field]
      return next
    })
  }
  return <section className="mt-8 rounded-xl bg-canvas p-4 sm:p-6" aria-labelledby="readiness-title">
    <h2 id="readiness-title" className="text-xl font-bold">Club readiness</h2>
    <p className="mt-2 text-sm text-muted">Assessment for this club using the published cycle. Optional answers below are self-reported and used only on this page; they are cleared when you leave or change account or club. They do not change your profile or establish organiser approval.</p>
    <div className="mt-4 flex flex-wrap gap-3"><p className="rounded-lg border border-border bg-white p-3"><strong>Eligibility:</strong> {eligibilityLabels[result.eligibility]}</p><p className="rounded-lg border border-border bg-white p-3"><strong>Document readiness:</strong> {result.documentReadiness.complete} / {result.documentReadiness.total} confirmed{result.documentReadiness.percentage === null ? ' · No applicable required documents' : ` · ${result.documentReadiness.percentage}%`}</p></div>
    <p className="mt-2 text-sm text-muted">Existing uploads are recorded as supplied, with no document validation status. They cannot count as confirmed. Conditional documents stay unresolved until their condition is answered. Missing information is unknown, not a failure.</p>
    {fields.length > 0 && <fieldset className="mt-5 grid gap-4 sm:grid-cols-2"><legend className="mb-3 font-semibold">Optional club and project information</legend>{fields.map(field => <label key={field} className="field">{factFields[field][0]}{factFields[field][1] === 'boolean' ? <select value={facts[field] === undefined ? '' : String(facts[field])} onChange={event => change(field, event.target.value)}><option value="">Not supplied</option><option value="true">Yes</option><option value="false">No</option></select> : <input type="number" min={0} max={factFields[field][1] === 'percentage' ? 100 : undefined} step={factFields[field][1] === 'percentage' ? 'any' : 1} value={typeof facts[field] === 'number' ? facts[field] as number : ''} onChange={event => change(field, event.target.value)} />}</label>)}</fieldset>}
    <h3 className="mt-6 font-semibold">Eligibility criteria</h3>
    {rules.length ? <ul className="mt-3 space-y-3">{result.ruleResults.map(row => <li key={row.rule.id} className="rounded-lg border border-border bg-white p-4"><p><strong>{row.rule.label}</strong> · {row.rule.mandatory ? 'Required' : 'Recommended'} · <span className="capitalize">{row.result}</span>{row.rule.verification !== 'verified' && ' · Needs verification'}</p><p className="mt-2 text-sm">{row.rule.explanation}</p><p className="mt-2 text-sm text-muted">{row.explanation}</p><RuleSource source={row.rule.source_reference} /></li>)}</ul> : <p className="mt-2">No reviewed assessment rules are available for this record.</p>}
    <h3 className="mt-6 font-semibold">Supporting documents</h3>
    {result.documentResults.length ? <ul className="mt-3 space-y-3">{result.documentResults.map(row => <li key={row.requirement.id} className="rounded-lg border border-border bg-white p-4"><p><strong>{row.requirement.description}</strong> · {row.requirement.required === false ? 'Recommended' : 'Required'}{row.requirement.condition && ' · Conditional'}</p><p className="mt-2 text-sm">{row.result === 'not_applicable' ? 'Not applicable — condition does not apply under your answers.' : `${row.supplied ? 'Supplied; validation unknown' : 'Missing information — unknown'}. ${row.condition === 'unknown' ? 'Confirm whether the condition applies.' : ''}`}</p><RuleSource source={row.requirement.source_reference} /></li>)}</ul> : <p className="mt-2">No reviewed document checklist is available. Check the organiser’s instructions.</p>}
    {result.missingInformation.length > 0 && <details className="mt-5"><summary className="cursor-pointer font-semibold">Missing information ({result.missingInformation.length})</summary><ul className="mt-2 list-inside list-disc">{result.missingInformation.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    {result.nextActions.length > 0 && <details className="mt-5"><summary className="cursor-pointer font-semibold">Next actions</summary><ul className="mt-2 list-inside list-disc">{result.nextActions.map((text, i) => <li key={i}>{text}</li>)}</ul></details>}
    <div className="mt-5 flex flex-wrap gap-4 text-sm text-accent-readable underline"><Link to="/club-profile">Complete profile / manage club documents</Link><Link to="/play-proof">View your PlayProof records</Link></div>
  </section>
}
