-- Phase B: database foundation only. No enqueue, evaluation or scheduler.
begin;
-- Composite keys enforce relationships even for privileged writers and concurrent
-- parent updates. Existing primary keys, rows and browser grants stay intact.
alter table public.opportunity_requirements add constraint readiness_requirement_identity unique(id,opportunity_id,version);
alter table public.evidence add constraint readiness_evidence_club unique(id,club_id);
alter table public.activities add constraint readiness_activity_club unique(id,club_id);

create table public.readiness_requirement_mappings (
 requirement_id uuid primary key,
 opportunity_id uuid not null,
 requirement_version integer not null,
 mapping_type text not null check (mapping_type in ('document','activity','club_info','unsupported')),
 document_type text check (document_type in ('club_registration','coach_qualification','annual_work_programme','safeguarding_policy','governing_body_resolution','financial_report','other')),
 activity_type text check (activity_type in ('training','match','tournament','community','other')),
 club_fields text[],
 min_count integer check (min_count > 0),
 created_at timestamptz not null default now(),
 foreign key(requirement_id,opportunity_id,requirement_version)
  references public.opportunity_requirements(id,opportunity_id,version) on delete cascade,
 unique(requirement_id,opportunity_id,requirement_version),
 check (
  (mapping_type='document' and document_type is not null and min_count is not null and activity_type is null and club_fields is null) or
  (mapping_type='activity' and activity_type is not null and min_count is not null and document_type is null and club_fields is null) or
  (mapping_type='club_info' and club_fields is not null and cardinality(club_fields)>0 and array_ndims(club_fields)=1
   and array_position(club_fields,null) is null
   and club_fields <@ array['name','county','sub_county','year_established','description','contact_email']::text[]
   and document_type is null and activity_type is null and min_count is null) or
  (mapping_type='unsupported' and document_type is null and activity_type is null and club_fields is null and min_count is null)
 )
);
-- Copy only existing structured facts, never prose or assumptions about null counts.
insert into public.readiness_requirement_mappings(requirement_id,opportunity_id,requirement_version,mapping_type,document_type,min_count)
select id,opportunity_id,version,
 case when requirement_type='document' and min_count is not null then 'document' else 'unsupported' end,
 case when requirement_type='document' and min_count is not null then document_type end,
 case when requirement_type='document' and min_count is not null then min_count end
from public.opportunity_requirements;

create function private.check_readiness_mapping() returns trigger
language plpgsql set search_path = '' as $$
declare r public.opportunity_requirements;
begin
 select * into r from public.opportunity_requirements where id=new.requirement_id for share;
 if new.mapping_type <> 'unsupported' and
  (new.mapping_type <> r.requirement_type or
   (new.mapping_type='document' and new.document_type is distinct from r.document_type) or
   (new.mapping_type in ('document','activity') and new.min_count is distinct from r.min_count)) then
  raise exception 'Mapping must match structured requirement fields' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.check_readiness_mapping() from public,anon,authenticated,service_role;
create trigger readiness_mapping_check before insert or update on public.readiness_requirement_mappings
for each row execute function private.check_readiness_mapping();

create table public.processing_jobs (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 job_type text not null default 'readiness' check(job_type='readiness'),
 payload jsonb not null default '{}' check(jsonb_typeof(payload)='object'),
 status text not null default 'queued' check(status in ('queued','running','done','failed')),
 attempts integer not null default 0,
 max_attempts integer not null default 5 check(max_attempts between 1 and 100),
 last_error text,
 run_after timestamptz not null default now() check(isfinite(run_after)),
 generation bigint not null default 1 check(generation>0),
 claimed_generation bigint check(claimed_generation>0 and claimed_generation<=generation),
 locked_at timestamptz check(isfinite(locked_at)),
 created_at timestamptz not null default now() check(isfinite(created_at)),
 updated_at timestamptz not null default now() check(isfinite(updated_at)),
 finished_at timestamptz check(isfinite(finished_at)),
 check(attempts between 0 and max_attempts),
 check((status='running')=(locked_at is not null)),
 check(status<>'running' or claimed_generation is not null),
 check((status in ('done','failed'))=(finished_at is not null)),
 check(status<>'queued' or attempts<max_attempts)
);
-- A successor may queue during a running evaluation; two evaluations of the
-- same club/type may never run together. Phase C must handle retry/successor merge.
create unique index processing_jobs_queued_unique on public.processing_jobs(club_id,job_type) where status='queued';
create unique index processing_jobs_running_unique on public.processing_jobs(club_id,job_type) where status='running';
create index processing_jobs_due on public.processing_jobs(run_after,created_at) where status='queued';

create table public.readiness_results (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 opportunity_id uuid not null,
 requirement_id uuid not null,
 requirement_version integer not null,
 status text not null default 'unknown' check(status in ('supplied','not_supplied','expiring','expired','unknown','not_applicable')),
 applicability text not null default 'unknown' check(applicability in ('applicable','not_applicable','unknown')),
 reason text not null default 'not_evaluated' check(length(trim(reason)) between 1 and 2000),
 evaluated_at timestamptz check(isfinite(evaluated_at)),
 processing_state text not null default 'never_assessed' check(processing_state in ('never_assessed','queued','running','current','stale','failed')),
 generation bigint not null default 1 check(generation>0),
 unique(club_id,requirement_id),
 unique(id,club_id),
 foreign key(requirement_id,opportunity_id,requirement_version)
  references public.readiness_requirement_mappings(requirement_id,opportunity_id,requirement_version) on delete cascade,
 check((status='not_applicable')=(applicability='not_applicable')),
 check(applicability<>'unknown' or status='unknown'),
 check(status='unknown' or evaluated_at is not null),
 check(processing_state<>'current' or evaluated_at is not null)
);
create index readiness_results_opportunity on public.readiness_results(club_id,opportunity_id);

create function private.check_readiness_result() returns trigger
language plpgsql set search_path = '' as $$
declare r public.opportunity_requirements; m public.readiness_requirement_mappings;
begin
 select * into r from public.opportunity_requirements where id=new.requirement_id for share;
 select * into m from public.readiness_requirement_mappings where requirement_id=new.requirement_id for share;
 if (m.mapping_type='unsupported' or r.condition is not null or r.verification<>'verified')
  and (new.status<>'unknown' or new.applicability<>'unknown') then
  raise exception 'Unsupported, unverified or conditional requirement must remain unknown' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function private.check_readiness_result() from public,anon,authenticated,service_role;
create trigger readiness_result_check before insert or update on public.readiness_results
for each row execute function private.check_readiness_result();

create table public.readiness_result_evidence (
 id uuid primary key default gen_random_uuid(),
 result_id uuid not null,
 club_id uuid not null,
 evidence_id uuid,
 activity_id uuid,
 check(num_nonnulls(evidence_id,activity_id)=1),
 foreign key(result_id,club_id) references public.readiness_results(id,club_id) on delete cascade,
 foreign key(evidence_id,club_id) references public.evidence(id,club_id) on delete cascade,
 foreign key(activity_id,club_id) references public.activities(id,club_id) on delete cascade,
 unique(result_id,evidence_id),
 unique(result_id,activity_id)
);
create index readiness_support_evidence on public.readiness_result_evidence(evidence_id,club_id) where evidence_id is not null;
create index readiness_support_activity on public.readiness_result_evidence(activity_id,club_id) where activity_id is not null;

alter table public.readiness_requirement_mappings enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.readiness_results enable row level security;
alter table public.readiness_result_evidence enable row level security;
-- No worker role is granted writes in Phase B, including the usual service role.
revoke all on public.readiness_requirement_mappings,public.processing_jobs,public.readiness_results,public.readiness_result_evidence
 from public,anon,authenticated,service_role;
grant select on public.readiness_requirement_mappings,public.readiness_results,public.readiness_result_evidence to authenticated;
create policy readiness_mapping_read on public.readiness_requirement_mappings for select to authenticated using(true);
create policy readiness_result_read on public.readiness_results for select to authenticated using(private.is_member(club_id));
create policy readiness_support_read on public.readiness_result_evidence for select to authenticated using(private.is_member(club_id));
commit;
