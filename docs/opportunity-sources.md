# Opportunity sources

**Implementation update (2026-11-08):** The opening three-source notes below describe the earlier catalogue. The five-programme specification and implementation review at the end supersede that catalogue. The legacy Laureus row is archived, preserving its existing tracking.

Reviewed 2026-11-08. These are partial published requirement sets, not eligibility decisions. All three seed records are demonstrations. No current open intake is asserted. Null deadlines mean unknown, not rolling applications. No scraping or personal information was used.

- **Kenya Sports Fund:** https://sasdef.go.ke/ — official search-index content supplied the Sports Organisation Application Requirements (registration, governing body resolution, work programme, conditional infrastructure approvals). Direct page fetch timed out twice. Current submission method, availability and deadline remain **unverified**. Historical status is a conservative display classification, not evidence that the Fund closed. No application link is supplied.
- **FIFA Foundation Community Programme 2025–2026:** https://inside.fifa.com/news/applications-open-for-2025-26-edition-of-fifa-foundation-community-programme links to the official [four-page guidelines](https://digitalhub.fifa.com/m/4bcde56e326df85b/original/FIFA-Foundation-Community-Programme-Application-Guidelines-2025-2026.pdf). Pages 1–2 establish eligibility and documents; page 4 gives 26 July 2024, 23:59 CET. The seed stores 22:59 UTC using the printed CET literally; any intended summer-time interpretation is unverified. Application URL is null because the old submission endpoint was not verified. Activity frequency is preserved in prose with no invented total count. Registration and financial evidence categories are proxies; presence cannot establish legal or audit compliance.
- **Laureus Sport for Good Response Fund:** https://www.laureus.com/sport-for-good/response-fund — official page explicitly says closed, and identifies worldwide sport for development organisations as applicants. Deadline and old submission channel are unverified and left null. Only that published organisational criterion is seeded; the page does not provide a complete document checklist.

Requirements retain a source URL and section/page in `source_note`. `is_current` means current catalogue requirement version, not an open application window. No numeric activity minimum is inferred from a timetable. Geography, conditional requirements and source limitations remain visible in prose. Review sources before any future publication as an open opportunity.

Apply migrations in filename order, then run `psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/seeds/opportunities.sql`. The local Supabase reset configuration uses this same seed. Stable IDs make repeat seeding safe; existing curated records are preserved, so changed future requirements need deliberate versioned edits. Seed only through trusted database credentials.































ClubReady — Verified Opportunities Integration Specification
Version: 1.0
Prepared: 2026-11-08
Implementation target: Existing ClubReady repository
Audience: Codex / implementation agent
Status: Implementation specification; source facts and live application status require verification before production publication.

1. Objective
Integrate a curated opportunities directory and explainable readiness checker into the existing ClubReady product. Seed five organiser-specific opportunities: Kenya Sports, Arts and Social Development Fund (SASDF), FIFA Foundation Community Programme, Safaricom Chapa Dimba, UEFA Foundation for Children, and GlobalGiving Pathway.

Do not scaffold a new app, replace the current database, assume a framework, or alter existing authentication. First inspect the repository and adapt this specification to the existing frontend, backend, data layer, club profiles, PlayProof/activity records, and design system. If a required service does not exist, implement the smallest compatible extension. Do not add paid integrations.

2. Product principles and non-goals
Distinguish opportunity availability, club eligibility, and document readiness. They are different fields and different UI states.
Never imply a grant is open, that a club is approved, or that uploading documents guarantees funding.
Cite the organiser's own official source at opportunity and rule level; keep historical rules labelled by cycle.
Treat requirements as machine-readable rules with clear pass, fail, unknown, or not_applicable outcomes. Missing evidence is unknown, not automatically a failure.
Let users view opportunities even when logged out, if the current app permits public pages; restrict club-specific assessments to authorised club users.
No submission automation in this MVP. Open the organiser's verified external application page instead.
No collection of children's IDs, NEMIS numbers, birth dates, or parental consent forms for Chapa Dimba readiness. Explain that these are handled by the organiser.
Avoid scraping third-party sites or inventing application URLs. Prefer manually curated seed data and admin-reviewed updates.
All monetary amounts, dates, eligibility thresholds and status labels must have a source and cycle; don't present historic data as current.
3. Repository reconnaissance (mandatory first step)
Inspect package manifests, routing, state management, database schema/ORM, existing club profile models, authentication, uploads, and tests.
Locate any existing opportunity, funding, sponsor, PlayProof, club activity, or document modules. Extend them rather than duplicating them.
Write a brief implementation plan identifying actual files to change and any unresolved schema assumptions.
Preserve the current styling, responsive behavior, accessibility, and existing data.
Use the repo's existing migrations, validation, testing, and lint conventions.
4. Data model
Implement equivalent types in the repository's language and persistence layer. Field names are a suggested contract; follow existing naming conventions where necessary.

4.1 Opportunity
type OpportunityType = 'government_grant' | 'foundation_grant' | 'tournament' | 'fundraising_platform';
type OpportunityStatus = 'open' | 'closed' | 'upcoming' | 'unconfirmed' | 'historical';
type VerificationStatus = 'official_source_reviewed' | 'needs_reverification';

type Opportunity = {
  id: string;                    // stable slug
  title: string;
  organiser: string;
  type: OpportunityType;
  description: string;
  geographicScope: string[];     // e.g. ['KE'] or ['international', 'KE']
  targetApplicants: string[];
  status: OpportunityStatus;
  cycle: string | null;
  opensAt: string | null;        // ISO date, null if unknown
  closesAt: string | null;
  amount: { currency: string; max: number | null; note: string } | null;
  officialUrl: string;
  applicationUrl: string | null; // ONLY if confirmed as actual application page
  verificationStatus: VerificationStatus;
  lastVerifiedAt: string | null; // set only after a real review
  nextReviewAt: string | null;
  eligibilityRules: EligibilityRule[];
  requiredDocuments: RequiredDocument[];
  applicationSteps: ApplicationStep[];
  notes: string[];
};

type SourceReference = {
  url: string;
  publisher: string;
  title: string;
  cycle?: string;
  exactLocation?: string;        // page heading / PDF section / quoted criterion
  verifiedAt: string | null;
};

type EligibilityRule = {
  id: string;
  label: string;
  explanation: string;
  kind: 'boolean' | 'number_min' | 'number_max' | 'percentage_min' | 'document' | 'informational' | 'manual_review';
  fieldPath: string | null;      // approved, non-sensitive club profile field
  threshold?: number;
  mandatory: boolean;
  source: SourceReference;
  verification: 'verified' | 'needs_verification';
};

type RequiredDocument = {
  id: string;
  label: string;
  required: boolean;
  condition?: string;            // e.g. only for infrastructure projects
  sensitive: boolean;
  source: SourceReference;
  verification: 'verified' | 'needs_verification';
};

type ApplicationStep = {
  order: number;
  text: string;
  url?: string;
  source: SourceReference;
};
Store rules and sources in normalised tables if that matches the existing backend; JSON columns are acceptable if consistent with repository conventions. Preserve seed IDs across runs. Ensure migrations are additive and seeds idempotent.

4.2 ClubOpportunityAssessment
type RuleResult = 'pass' | 'fail' | 'unknown' | 'not_applicable';
type ClubOpportunityAssessment = {
  clubId: string;
  opportunityId: string;
  assessedAt: string;
  eligibility: 'potentially_eligible' | 'ineligible' | 'insufficient_information' | 'manual_review_required';
  documentReadiness: { complete: number; total: number; percentage: number | null };
  ruleResults: Array<{
    ruleId: string;
    result: RuleResult;
    explanation: string;
    evidenceReference?: string;  // only reference an authorised, existing document/activity
  }>;
  missingInformation: string[];
  nextActions: string[];
};
Do not store redundant copies of sensitive club documents. Reuse existing document references and permission checks. Assessments may be calculated on demand; cache only if the repository already has an appropriate pattern.

5. Seed catalogue — five opportunities
The links below are organiser-controlled pages. They are source starting points, not proof of a currently open application. Historical dates and criteria must be shown with their cycle. The requirements below are derived from the research supplied for this specification; Codex must review each primary source before marking any individual rule verified. If an official source cannot substantiate a detail, mark it needs_verification and do not automatically reject a club on that basis.

OPP-001 — Sports, Arts and Social Development Fund (SASDF), Kenya
ID: sasdf-kenya-sports-funding
Type: government_grant
Status: unconfirmed (do not display “open”)
Cycle / dates: unknown / null
Official source: https://sasdef.go.ke/
Application URL: null until verified
Target: Eligible Kenyan sports organisations; confirm specific call requirements.
Candidate mandatory checks: Sports Act registration; approved annual work programme; governing-body resolution authorising the application; organisation bank details and authorised signatories; declaration of other programme funding.
Conditional documents: Project plans/designs, bills of quantities, regulatory approvals where applicable to the requested project.
Process: (1) Read the current funding notice and eligibility requirements; (2) prepare governing and project documents; (3) use the officially announced application channel; (4) follow the organiser's tracking process if available.
Critical caveat: The public website is not necessarily a direct application form. Don't generate a fabricated application URL.
ClubReady mapping: registrationStatus, sportsActRegistration, annualWorkProgramme, boardResolution, fundingDeclaration, organisationBankAccountConfirmed (boolean only; never display account numbers), optional projectDocuments.
OPP-002 — FIFA Foundation Community Programme
ID: fifa-foundation-community-2025-26
Type: foundation_grant
Status: historical
Cycle: 2025–26
Dates: null unless confirmed from official call
Official sources: https://inside.fifa.com/en/organisation/fifa-foundation/about-us and https://inside.fifa.com/news/applications-open-for-2025-26-edition-of-fifa-foundation-community-programme
Application URL: null (past cycle; only add a new URL after a new official call)
Historical funding limit: up to USD 30,000 or 50% of annual turnover, whichever is lower, subject to verification against the original call guidelines. Never apply to future cycles automatically.
Target: Established nonprofit/NGO programmes using football for social development of disadvantaged young people; ordinary competitive football teams are not automatically eligible.
Candidate checks: legal nonprofit status; regular football-for-social-development activities; financial accountability; child safeguarding; nondiscrimination.
Candidate supporting evidence: financial statements, annual/impact report, programme activity records, safeguarding policy; verify the exact mandatory documents in the cycle's official application guidance.
Process: (1) Wait for official call; (2) read cycle-specific guidelines; (3) prepare nonprofit, programme, finance and safeguarding evidence; (4) apply using official cycle-specific channel; (5) await organiser review.
ClubReady mapping: nonprofitRegistration, footballForDevelopment, safeguardingPolicy, nondiscriminationPolicy, financialStatements, PlayProof activity summaries.
OPP-003 — Safaricom Chapa Dimba
ID: safaricom-chapa-dimba-2026
Type: tournament
Status: closed
Cycle: 2026 / Season 5
Registration dates (historical; recheck): 2026-05-11 to 2026-06-11
Official source: https://sports.safaricom.co.ke/outreach
Application URL: null unless the actual current registration page is verified
Target: Kenyan boys' and girls' grassroots football teams.
Historical candidate criteria (reverify against organiser's full rules): players aged 15–18; at least 18 players per team; team location, county/sub-county, coach and manager details; player identification; parent/guardian consent for minors; registration free.
Process: (1) Wait for registration announcement; (2) coach submits team and officials on organiser portal; (3) coach handles individual player identity and consent on the organiser's portal, not ClubReady; (4) organiser vets applications; (5) qualifying teams participate.
ClubReady mapping: teamCategory, county, subCounty, coachContactAvailable, teamManagerAvailable, eligiblePlayerCount (aggregate only).
Privacy: NEVER request, upload, store, log, or parse minor IDs, NEMIS numbers, full birth dates, guardian signatures or consent forms in ClubReady. Render informational notice and external organiser link.
OPP-004 — UEFA Foundation for Children, 2026 call
ID: uefa-foundation-children-2026
Type: foundation_grant
Status: closed
Cycle: 2026
Historical call dates: 2026-06-29 to 2026-08-03 (verify from official call)
Official call: https://uefafoundation.org/general-information/call-for-projects-2/
Official criteria PDF: https://uefafoundation.org/wp-content/uploads/2026/06/criteres-de-projets_call_website_en-6a438b2638d51.pdf
Application URL: null unless verified as a functioning, current candidate portal
Target: Projects benefiting vulnerable children through sport, education, inclusion and development, including eligible projects outside Europe.
Candidate mandatory criteria (2026 only): institutional recognition or registration for at least 3 years; approved and published financial/audit reports for the preceding 3 years; compliance with ethics code; majority of project participants under 18; at least 20% girls' participation; projects focused primarily on talent scouting/training/promotion are excluded. Verify precise wording and logical conditions in the official PDF before enforcing.
Other assessment dimensions: project impact, inclusion, sustainability, local relevance, partnerships, budget/co-funding, environmental considerations. Do not treat scoring factors as hard eligibility thresholds.
Process: (1) Review current year's call; (2) check mandatory criteria; (3) prepare project and organisational documentation; (4) submit via official candidate platform during open window; (5) await Foundation/Board decision.
ClubReady mapping: yearsRegistered, institutionalRecognition, financialReportsLast3Years, ethicsCodeAccepted, under18ParticipantShare, girlsParticipantShare, primaryProjectPurpose.
Rule examples: institutionalRecognition === true || yearsRegistered >= 3; girlsParticipantShare >= 20; under18ParticipantShare > 50. Use unknown when inputs are absent. Only enforce these after primary-source confirmation.
OPP-005 — GlobalGiving Pathway to GlobalGiving
ID: globalgiving-pathway
Type: fundraising_platform
Status: unconfirmed until interest survey is checked live; an accessible survey does not mean acceptance or guaranteed invitation.
Cycle / dates: rolling/invitation-based; do not invent a closing date
Official source: https://www.globalgiving.org/pathway-to-globalgiving/
Official due diligence: https://www.globalgiving.org/nonprofit-due-diligence-documents/
Application URL: null until actual interest survey URL verified; programme overview can always be linked
Target: Eligible registered nonprofit organisations, including organisations outside the United States.
Candidate documents: organisational legal/founding documents; programme evidence (annual reports, brochures, newsletters, coverage); reference from partner/supporter/community member; financial statements for two fiscal years; current-year budget; organisation-held bank account; leadership/board names; relevant compliance declarations and policies. Verify exact requirements for Kenyan/non-US organisations and conditional exemptions.
Process: (1) Complete interest survey; (2) await invitation, not guaranteed; (3) complete Fundraising-Ready Workbook if invited; (4) submit due-diligence materials; (5) await onboarding approval.
ClubReady mapping: nonprofitRegistration, foundingDocuments, programmeEvidence, referenceLetter, financialStatementsLast2Years, currentYearBudget, organisationBankAccountConfirmed, boardList, complianceDeclarations.
Important: GlobalGiving is a fundraising platform onboarding process, not a direct grant and not a football-specific competition.
6. Matching and readiness engine
Implement deterministic, testable rules. Do not use an LLM to decide hard eligibility. LLM-generated descriptions may be considered later, but only as optional explanations grounded in verified rules.

Availability: derive display status from admin-reviewed status and verified cycle dates. Never turn an old closed/`historical` seed into open automatically. If status verification is stale, display Status not confirmed rather than Apply now.
Rule evaluation: pass when known club evidence satisfies a verified rule; fail when known evidence contradicts a verified mandatory rule; unknown when evidence is missing or rule is unverified; not_applicable when a documented condition does not apply.
Eligibility: ineligible only when a verified mandatory rule fails; potentially_eligible only when all applicable verified mandatory rules pass and there are no unresolved mandatory rules; insufficient_information when mandatory evidence is missing; manual_review_required for criteria that cannot be safely evaluated automatically.
Document readiness: (number of confirmed required documents / number of applicable required documents) * 100; return null when denominator is zero. A present upload is not necessarily an approved/valid document: use existing document verification status when available.
Explanation: show each outcome with the rule, evidence used, missing information and official source. Separate Required from Recommended and Needs verification.
Never use a generic match percentage as a guarantee of funding or selection. If ranking is needed, prioritise location, opportunity type, and clearly satisfied criteria, and explain the ranking.
No sensitive derivation: Chapa Dimba player identity and consent remain informational organiser-side steps; ClubReady may use aggregate team counts without identifying minors.
Example output
{
  "opportunityId": "uefa-foundation-children-2026",
  "availability": "closed",
  "eligibility": "insufficient_information",
  "documentReadiness": { "complete": 1, "total": 3, "percentage": 33.33 },
  "ruleResults": [
    { "ruleId": "girls-participation", "result": "unknown", "explanation": "No aggregate participation percentage has been supplied." }
  ],
  "nextActions": ["Confirm girls' participation percentage", "Review the official 2026 eligibility criteria"]
}
7. Backend/API contract
Follow existing repository patterns. If the app has no HTTP backend, expose equivalent server-side queries/actions or repository functions rather than creating an unrelated server.

Operation	Example route	Behavior
List opportunities	GET /api/opportunities	Paginated list; filters: type, status, country, search
Opportunity detail	GET /api/opportunities/:id	Source links, dated rules, documents, steps, status
Club assessment	GET /api/clubs/:clubId/opportunities/:id/assessment	Authorised club-specific evaluation
Reassess	POST /api/clubs/:clubId/opportunities/:id/assess	Optional; use only if existing architecture requires persisted evaluation
Admin update	Existing admin mutation pattern	Edit sources, statuses, rules and dates; permission restricted; audit changes
Return consistent errors (400 invalid filters, 401 unauthenticated, 403 wrong club, 404 missing opportunity). Validate input server-side. Avoid leaking club documents or private profile fields through public opportunity endpoints.

8. Frontend integration
8.1 Opportunity directory
Add an Opportunities entry in existing navigation without removing any menu item.
Display cards with title, organiser, type (Grant, Tournament, Fundraising platform), geographical scope, cycle, availability and last verification date.
Filters: opportunity type, availability, country and text search; accessible on mobile.
Show Closed, Historical or Status unconfirmed prominently and correctly. Do not render Apply now for closed/historical/unconfirmed opportunities.
8.2 Opportunity detail
Show: programme description, eligible applicants, application period, funding amount only when sourced, official links, mandatory eligibility criteria, conditional criteria, supporting documents, application steps, source and verification date, and caveats. For old calls, show Historical criteria — recheck the next call.

8.3 Club readiness view
If signed in as an authorised club member, show:

Separate chips/labels for Availability, Eligibility, and Document readiness.
Explainable per-rule pass/fail/unknown status and missing documents.
Existing PlayProof evidence links where permitted.
Complete club profile / Upload document actions only when matching routes already exist.
External Visit official organiser website link; use rel="noopener noreferrer" for new-tab links.
For Chapa Dimba, a privacy notice: Player identity and parental consent documents must be submitted directly to the organiser. ClubReady does not collect them.
9. Source governance and freshness
Seed every opportunity with the exact official URLs above; attach primary source URL to each machine-readable rule/document.
Review the actual official page/PDF and record verifiedAt before changing a rule's verification to verified.
Record original cycle, source title and location (page heading or PDF section); do not overwrite historical rules with new-cycle rules.
Only mark open when the organiser explicitly confirms an active call and current dates/application route. A programme homepage or interest page alone is insufficient proof of a grant opening.
If a source is unavailable, retain its link, mark needs_verification, and avoid enforcement of unconfirmed criteria.
Prefer an admin-managed update workflow; optional future scheduled verification should create a review flag, not silently change eligibility rules.
Log admin edits to statuses, dates, rules, source URLs and verified timestamps.
10. Testing and acceptance criteria
Unit tests
Missing club field yields unknown, not fail.
A verified mandatory rule failure yields ineligible.
An unverified rule cannot automatically disqualify a club.
UEFA OR logic (institutionalRecognition OR yearsRegistered >= 3) works, including unknown operands.
UEFA participation threshold checks use aggregate values and correct comparison operators.
Conditional documents are excluded from the denominator when inapplicable.
A document marked uploaded but not validated is not silently treated as approved when verification is required.
Closed and historical opportunities cannot show Apply now.
A GlobalGiving entry is categorised as fundraising_platform, not foundation_grant.
Integration / UI tests
Exactly five distinct seed opportunities exist after repeated seed runs; no duplicates.
Directory loads, filters and links to details.
Sources are displayed on each detail page.
Club A cannot request Club B's private assessment.
No personal identification, NEMIS, or minor consent upload fields are added for Chapa Dimba.
Existing club dashboard, authentication, uploads and PlayProof flows still work.
Responsive layout and keyboard navigation work.
Existing build, lint and test commands pass; report any pre-existing failures separately.
Definition of done
Five opportunity records seeded with stable IDs and official links.
All rules/documents have source references and verification flags.
Opportunity directory, detail page and club-specific readiness experience integrated into existing UI.
Deterministic assessment engine with tests and clear unknown/failed distinctions.
No false open claims or fabricated application URLs.
No collection of children's identity/consent documents.
Add a short README explaining how an authorised maintainer updates opportunities and verifies new cycles.
Report changed files, migrations, commands run, tests, limitations and which facts still require source verification.
11. Codex execution instruction
Implement this specification in the current ClubReady repository. Start by inspecting the codebase and describing the existing architecture and exact integration points. Then implement incrementally: (1) data model/seed, (2) rules engine/tests, (3) backend or existing data-access integration, (4) directory/detail/readiness UI, (5) verification and regression checks. Preserve existing features and styling. Do not invent API endpoints, live calls, eligibility facts, application URLs, database credentials or document requirements. If source verification or repository details are unavailable, mark them unresolved and continue with a safe implementation. At the end, summarise the files changed and remaining manual checks.

## Implementation review — five-programme catalogue

Reviewed primary sources on 2026-11-08. This section records implementation decisions without changing the supplied specification above.

- SASDF: the official homepage fetched successfully this time. Its Sports Organisation requirements confirm registration, programme, resolution, conditional infrastructure records, other-funding declaration and organisational bank details. ClubReady asks only for bank-account confirmation, not financial identifiers. Current intake and channel are still unconfirmed.
- FIFA: reviewed the official 2025–26 PDF linked above. Historical dates, amount and criteria remain tied to that cycle; no current application URL is published.
- UEFA: the official call page explicitly says the 2026 call is closed. The supplied criteria PDF confirms recognition OR three-year registration, the participation thresholds, ethics, financial reporting and talent-purpose exclusion. Weighted factors remain notes, not rejection rules. Opening/closing dates were not confirmed and are null.
- Chapa Dimba: official outreach fetch returned 401. Official indexed content supports the programme identity but not the proposed cycle thresholds or dates. Status is conservatively unconfirmed (overriding the proposed closed label until primary evidence is available). Candidate rules remain needs_verification and cannot reject a club. No personal player identity, birth-date or consent fields were added.
- GlobalGiving: live pages returned 403; official indexed Pathway content describes the invitation/workbook/onboarding process. Current survey route and non-US checklist details remain unverified. This is a fundraising platform, with no direct-grant or open-intake claim. Candidate documents and rules are flagged for verification.

Schema/seed compatibility: apply `202611080003_opportunity_assessments.sql` after the previous migrations, then rerun `supabase/seeds/opportunities.sql`. There are exactly five **listed** seeded programmes; the sixth, legacy Laureus record and its requirement history remain archived rather than deleted. SASDF and FIFA keep their original UUIDs, and all existing tracking is preserved. Stable slugs identify the five organiser/cycle records without replacing UUID foreign keys. Seed revision 2 updates only earlier revisions; repeat runs do not overwrite subsequent maintainer edits.

Assessment limits: existing profiles do not contain legal registration age, nonprofit status or project participation shares. The readiness view therefore offers optional, allowlisted boolean/aggregate answers for the current page only. It does not infer legal registration from year established, infer eligibility from activity counts, persist answers, or add sensitive fields. Club evidence still comes through existing RLS-protected queries. There is no new public/private API or assessment cache. Supplied documents have no validation state, so confirmed-document readiness remains zero until an authorised document-validation workflow exists; inapplicable conditional documents are excluded. A criterion can pass based on supplied answers without establishing organiser approval.

Maintainer changes use trusted SQL, retaining cycles and version history. Database triggers audit changes to catalogue, requirements and rules in `private.opportunity_audit`; clients have no write grants or access to that audit. There is no existing catalogue-admin UI or separate maintainer role to extend, so club administrators do not receive catalogue-edit authority. New source verification should include the exact official URL, title, location, cycle and review date. Do not enable open/apply links without a confirmed channel, window and next review date.
