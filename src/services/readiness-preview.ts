// Frontend fixture adapter only. Replace through an agreed backend contract.
export type ReadinessStatus = 'supplied' | 'not_supplied' | 'expiring' | 'expired'
export interface ReadinessSupport { id: string; kind: 'document' | 'activity'; label: string }
export interface ReadinessResult {
  id: string; description: string; status: ReadinessStatus; requirementsVersion: number
  reason: string; support: ReadinessSupport[]
}
export interface ReadinessSnapshot { assessedAt: string; results: ReadinessResult[] }
export interface ReadinessScope { clubId: string; opportunityId: string }
export interface ReadinessAdapter {
  load(scope: ReadinessScope): Promise<ReadinessSnapshot>
  recompute(scope: ReadinessScope): Promise<ReadinessSnapshot>
}
function fixture(): ReadinessSnapshot {
  return {
    assessedAt: new Date().toISOString(),
    results: [
      { id: 'sample-registration', description: 'Sample registration document', status: 'supplied', requirementsVersion: 1, reason: 'One sample document is present.', support: [{ id: 'sample-doc-1', kind: 'document', label: 'Sample registration.pdf' }] },
      { id: 'sample-tournament', description: 'Sample tournament activity', status: 'not_supplied', requirementsVersion: 1, reason: 'No matching sample activity is present.', support: [] },
      { id: 'sample-policy', description: 'Sample safeguarding policy', status: 'expiring', requirementsVersion: 1, reason: 'Sample document approaches its expiry date.', support: [{ id: 'sample-doc-2', kind: 'document', label: 'Sample policy.pdf' }] },
      { id: 'sample-report', description: 'Sample financial report', status: 'expired', requirementsVersion: 1, reason: 'Sample document has passed its expiry date.', support: [{ id: 'sample-doc-3', kind: 'document', label: 'Sample report.pdf' }] },
    ],
  }
}
export const readinessPreview: ReadinessAdapter = {
  async load() { return fixture() },
  async recompute() {
    const snapshot = fixture()
    snapshot.results[1] = { ...snapshot.results[1], status: 'supplied', reason: 'A sample tournament activity was added for this simulation.', support: [{ id: 'sample-activity-1', kind: 'activity', label: 'Sample community tournament' }] }
    return snapshot
  },
}
