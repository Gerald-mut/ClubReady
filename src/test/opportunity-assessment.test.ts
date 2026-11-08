import { expect, it } from 'vitest'
import { assessOpportunity, availability, evaluateExpression, validFact, type EligibilityRule, type Expression } from '../services/opportunity-assessment'
import type { CatalogueOpportunity, Requirement } from '../services/opportunities'
import type { Evidence } from '../types/club'
const rule: EligibilityRule = { id: 'one', opportunity_id: 'opp', version: 2, label: 'Girls participation', explanation: 'Minimum 20%', mandatory: true, expression: { op: 'gte', field: 'girlsParticipantShare', value: 20 }, verification: 'verified', is_current: true, source_reference: { url: 'https://example.org', publisher: 'Provider', title: 'Criteria', verified_at: '2026-11-08' } }
it('keeps missing, invalid, or unverified facts unknown', () => {
  expect(assessOpportunity([rule], [], {}, []).ruleResults[0].result).toBe('unknown')
  expect(assessOpportunity([rule], [], {}, []).eligibility).toBe('insufficient_information')
  expect(assessOpportunity([{ ...rule, verification: 'needs_verification' }], [], { girlsParticipantShare: 0 }, []).eligibility).not.toBe('ineligible')
  expect(assessOpportunity([{ ...rule, source_reference: { ...rule.source_reference, verified_at: null } }], [], { girlsParticipantShare: 0 }, []).ruleResults[0].result).toBe('unknown')
  expect(evaluateExpression(rule.expression, { girlsParticipantShare: 101 })).toBe('unknown')
  expect(validFact('birthDate', '2010-01-01')).toBe(false)
  expect(validFact('eligiblePlayerCount', 1.5)).toBe(false)
})
it('only rejects on verified mandatory failure and distinguishes optional failures', () => {
  expect(assessOpportunity([rule], [], { girlsParticipantShare: 19 }, []).eligibility).toBe('ineligible')
  expect(assessOpportunity([rule], [], { girlsParticipantShare: 20 }, []).eligibility).toBe('potentially_eligible')
  expect(assessOpportunity([{ ...rule, mandatory: false }], [], { girlsParticipantShare: 0 }, []).eligibility).toBe('manual_review_required')
})
it('implements UEFA recognition OR years with three-valued logic', () => {
  const expression: Expression = { op: 'or', args: [{ op: 'eq', field: 'institutionalRecognition', value: true }, { op: 'gte', field: 'yearsRegistered', value: 3 }] }
  expect(evaluateExpression(expression, { institutionalRecognition: true })).toBe('pass')
  expect(evaluateExpression(expression, { yearsRegistered: 3 })).toBe('pass')
  expect(evaluateExpression(expression, { institutionalRecognition: false })).toBe('unknown')
  expect(evaluateExpression(expression, { institutionalRecognition: false, yearsRegistered: 2 })).toBe('fail')
  expect(evaluateExpression(expression, {})).toBe('unknown')
})
it('uses strict majority and inclusive girls thresholds', () => {
  const expression: Expression = { op: 'gt', field: 'under18ParticipantShare', value: 50 }
  expect(evaluateExpression(expression, { under18ParticipantShare: 50 })).toBe('fail')
  expect(evaluateExpression(expression, { under18ParticipantShare: 50.1 })).toBe('pass')
  expect(evaluateExpression(rule.expression, { girlsParticipantShare: 20 })).toBe('pass')
})
it('excludes inapplicable conditional documents and never approves supplied uploads', () => {
  const document = { id: 'doc', requirement_type: 'document', description: 'Plans', required: true, verification: 'verified', source_reference: rule.source_reference, document_type: 'other', condition: { op: 'eq', field: 'infrastructureProject', value: true } } as Requirement
  const evidence = { id: 'evidence', document_type: 'other', status: 'supplied' } as Evidence
  const excluded = assessOpportunity([], [document], { infrastructureProject: false }, [evidence])
  expect(excluded.documentReadiness).toEqual({ complete: 0, total: 0, percentage: null })
  expect(excluded.documentResults[0].result).toBe('not_applicable')
  const present = assessOpportunity([], [document], { infrastructureProject: true }, [evidence])
  expect(present.documentResults[0]).toMatchObject({ result: 'unknown', supplied: 1, evidenceReference: 'evidence' })
  expect(present.documentReadiness).toEqual({ complete: 0, total: 1, percentage: 0 })
  expect(assessOpportunity([], [document], {}, []).documentResults[0].result).toBe('unknown')
  expect(assessOpportunity([], [{ ...document, verification: 'needs_verification' }], { infrastructureProject: false }, []).documentResults[0].result).toBe('unknown')
})
it('requires manual review for nonautomatable rules', () => {
  expect(assessOpportunity([{ ...rule, expression: { op: 'manual' } }], [], {}, []).eligibility).toBe('manual_review_required')
})
it('never reopens old calls and suppresses stale open claims', () => {
  const opportunity = { status: 'open', verification_status: 'official_source_reviewed', last_verified_at: '2026-11-08', next_review_at: '2026-12-08', application_url: 'https://example.org/apply', opens_at: '2026-11-01', deadline: '2026-11-30' } as CatalogueOpportunity
  expect(availability(opportunity, '2026-11-08')).toBe('open')
  expect(availability(opportunity, '2027-01-01')).toBe('unconfirmed')
  expect(availability({ ...opportunity, status: 'historical' }, '2026-11-08')).toBe('historical')
  expect(availability({ ...opportunity, status: 'closed' }, '2026-11-08')).toBe('closed')
  expect(availability({ ...opportunity, application_url: null }, '2026-11-08')).toBe('unconfirmed')
  expect(availability({ ...opportunity, deadline: '2026-11-02' }, '2026-11-08')).toBe('closed')
})
