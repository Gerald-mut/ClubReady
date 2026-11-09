begin;
-- Only the two existing source-verified, unconditional registration requirements.
-- This maps document presence; it neither verifies documents nor infers eligibility.
insert into public.readiness_requirement_mappings
 (requirement_id, opportunity_id, requirement_version, mapping_type, document_type, min_count)
select id, opportunity_id, version, 'document', document_type, min_count
from public.opportunity_requirements
where id in ('64000000-0000-0000-0000-000000000001', '64000000-0000-0000-0000-000000000006')
 and version=2 and is_current and requirement_type='document'
 and document_type='club_registration' and min_count=1
 and verification='verified' and condition is null
on conflict (requirement_id) do nothing;
commit;
