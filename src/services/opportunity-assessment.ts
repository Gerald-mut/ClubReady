import type { Evidence } from '../types/club'
import type { CatalogueOpportunity, Requirement } from './opportunities'

export interface SourceReference { url: string; publisher: string; title: string; cycle?: string; exact_location?: string; verified_at: string | null }
export const factFields = {
  sportsActRegistration: ['Sports Act registration confirmed', 'boolean'],
  nonprofitRegistration: ['Nonprofit registration confirmed', 'boolean'],
  footballForDevelopment: ['Football used for social development', 'boolean'],
  nondiscriminationPolicy: ['Nondiscrimination policy confirmed', 'boolean'],
  organisationBankAccountConfirmed: ['Organisation-held bank account confirmed (no account details)', 'boolean'],
  institutionalRecognition: ['Institutional recognition confirmed', 'boolean'],
  yearsRegistered: ['Years legally registered', 'number'],
  ethicsCodeAccepted: ['UEFA ethics code accepted', 'boolean'],
  under18ParticipantShare: ['Participants under 18 (%) — aggregate only', 'percentage'],
  girlsParticipantShare: ['Girls participating (%) — aggregate only', 'percentage'],
  talentFocused: ['Project primarily scouts, trains or promotes talent', 'boolean'],
  infrastructureProject: ['Funding request includes infrastructure', 'boolean'],
  eligiblePlayerCount: ['Players in the candidate age range — aggregate count only', 'number'],
  coachContactAvailable: ['Coach contact available to submit to organiser', 'boolean'],
  teamManagerAvailable: ['Team manager available', 'boolean'],
} as const
export type FactKey = keyof typeof factFields
export type Facts = Partial<Record<FactKey, boolean | number>>
export type Expression = { op: 'eq' | 'gte' | 'gt' | 'lte'; field: FactKey; value: boolean | number }
  | { op: 'or' | 'and'; args: Expression[] }
  | { op: 'document'; document_type: Evidence['document_type'] }
  | { op: 'manual' | 'informational' }
export interface EligibilityRule {
  id: string; opportunity_id: string; version: number; label: string; explanation: string
  mandatory: boolean; expression: Expression; source_reference: SourceReference
  verification: 'verified' | 'needs_verification'; is_current: boolean
}
export type RuleResult = 'pass' | 'fail' | 'unknown' | 'not_applicable'
export function validFact(field: string, value: unknown): boolean {
  if (!Object.hasOwn(factFields, field)) return false
  const kind = factFields[field as FactKey][1]
  return kind === 'boolean' ? typeof value === 'boolean' : typeof value === 'number' && Number.isFinite(value) && value >= 0 && (kind === 'percentage' ? value <= 100 : Number.isInteger(value))
}
export function evaluateExpression(expression: Expression, facts: Facts): RuleResult {
  if (expression.op === 'manual' || expression.op === 'informational' || expression.op === 'document') return 'unknown'
  if (expression.op === 'or' || expression.op === 'and') {
    if (!expression.args.length) return 'unknown'
    const results = expression.args.map(arg => evaluateExpression(arg, facts))
    if (expression.op === 'or') return results.includes('pass') ? 'pass' : results.every(value => value === 'fail') ? 'fail' : 'unknown'
    return results.includes('fail') ? 'fail' : results.every(value => value === 'pass') ? 'pass' : 'unknown'
  }
  if (!('field' in expression)) return 'unknown'
  const value = facts[expression.field]
  if (!validFact(expression.field, value) || typeof value !== typeof expression.value) return 'unknown'
  const satisfied = expression.op === 'eq' ? value === expression.value
    : typeof value !== 'number' || typeof expression.value !== 'number' ? null
    : expression.op === 'gte' ? value >= expression.value : expression.op === 'gt' ? value > expression.value : expression.op === 'lte' ? value <= expression.value : null
  return satisfied === null ? 'unknown' : satisfied ? 'pass' : 'fail'
}
export function fieldsFor(expression: Expression): FactKey[] {
  if ('args' in expression) return expression.args.flatMap(fieldsFor)
  return 'field' in expression && Object.hasOwn(factFields, expression.field) ? [expression.field] : []
}
export function assessOpportunity(rules: EligibilityRule[], requirements: Requirement[], facts: Facts, documents: Evidence[]) {
  const ruleResults = rules.map(rule => {
    const verified = rule.verification === 'verified' && !!rule.source_reference.verified_at
    const result = verified ? evaluateExpression(rule.expression, facts) : 'unknown'
    return { rule, result, explanation: !verified ? 'Source criterion needs verification; it cannot exclude your club.' : rule.expression.op === 'document' ? 'Uploaded evidence has no validation status. Organiser or authorised review is needed.' : result === 'unknown' ? 'More information or manual review is needed.' : `${result === 'pass' ? 'Supplied answers satisfy' : 'Supplied answers contradict'} this published criterion; organiser review still applies.` }
  })
  const mandatory = ruleResults.filter(result => result.rule.mandatory)
  let eligibility: 'ineligible' | 'potentially_eligible' | 'insufficient_information' | 'manual_review_required' = mandatory.some(row => row.result === 'fail') ? 'ineligible'
    : !mandatory.length ? 'manual_review_required'
    : mandatory.some(row => row.result === 'unknown' && ['manual', 'informational', 'document'].includes(row.rule.expression.op)) ? 'manual_review_required'
    : mandatory.some(row => row.result === 'unknown') ? 'insufficient_information' : 'potentially_eligible'
  const documentResults = requirements.filter(row => row.requirement_type === 'document').map(requirement => {
    const condition = requirement.condition ? (requirement.verification === 'verified' && requirement.source_reference?.verified_at ? evaluateExpression(requirement.condition, facts) : 'unknown') : 'pass'
    const matching = requirement.document_type ? documents.filter(document => document.document_type === requirement.document_type) : []
    return { requirement, result: condition === 'fail' ? 'not_applicable' as const : 'unknown' as const, supplied: matching.length, evidenceReference: matching[0]?.id, condition }
  })
  const applicable = documentResults.filter(row => row.requirement.required !== false && row.result !== 'not_applicable')
  // Existing evidence status is only 'supplied'. It never confirms validity or approval.
  const total = applicable.length
  if (total && eligibility !== 'ineligible' && eligibility !== 'insufficient_information') eligibility = 'manual_review_required'
  return { eligibility, ruleResults, documentResults,
    documentReadiness: { complete: 0, total, percentage: total ? 0 : null },
    missingInformation: ruleResults.filter(row => row.result === 'unknown').map(row => row.rule.label),
    nextActions: [...new Set([...ruleResults.filter(row => row.result !== 'pass').map(row => `Review: ${row.rule.label}`), ...applicable.map(row => `${row.supplied ? 'Arrange document review' : 'Prepare document'}: ${row.requirement.description}`)])],
  }
}
export const availabilityLabels = { open: 'Open', closed: 'Closed', historical: 'Historical', upcoming: 'Upcoming', unconfirmed: 'Status unconfirmed' } as const
export function availability(opportunity: CatalogueOpportunity, today = new Date().toISOString()): keyof typeof availabilityLabels {
  if (opportunity.status === 'closed' || opportunity.status === 'historical') return opportunity.status
  if (opportunity.verification_status !== 'official_source_reviewed' || !opportunity.last_verified_at || !opportunity.next_review_at || opportunity.next_review_at < today.slice(0, 10)) return 'unconfirmed'
  if (opportunity.status === 'open') {
    if (!opportunity.application_url || !opportunity.deadline || !opportunity.opens_at || !Number.isFinite(Date.parse(opportunity.deadline)) || !Number.isFinite(Date.parse(opportunity.opens_at))) return 'unconfirmed'
    if (Date.parse(opportunity.deadline) < Date.parse(today)) return 'closed'
    if (Date.parse(opportunity.opens_at) > Date.parse(today)) return 'upcoming'
  }
  return opportunity.status
}
