-- Additive extension; historical UUIDs and tracking remain intact.
begin;
alter table public.opportunities drop constraint opportunities_status_check;
alter table public.opportunities drop constraint opportunities_check;
alter table public.opportunities add constraint opportunities_status_check check (status in ('open','closed','upcoming','unconfirmed','historical'));
alter table public.opportunities add constraint opportunities_demonstration_check check (status not in ('closed','historical') or is_demonstration);
alter table public.opportunities
 add column slug text unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 add column opportunity_type text not null default 'foundation_grant' check (opportunity_type in ('government_grant','foundation_grant','tournament','fundraising_platform')),
 add column geographic_scope text[] not null default '{}',
 add column target_applicants text[] not null default '{}',
 add column cycle text,
 add column opens_at timestamptz,
 add column amount jsonb check (amount is null or jsonb_typeof(amount)='object'),
 add column verification_status text not null default 'needs_reverification' check (verification_status in ('official_source_reviewed','needs_reverification')),
 add column last_verified_at date,
 add column next_review_at date,
 add column application_steps jsonb not null default '[]' check (jsonb_typeof(application_steps)='array'),
 add column sources jsonb not null default '[]' check (jsonb_typeof(sources)='array'),
 add column notes text[] not null default '{}',
 add column is_listed boolean not null default true,
 add column curation_revision integer not null default 0;
alter table public.opportunity_requirements
 add column required boolean not null default true,
 add column condition jsonb,
 add column source_reference jsonb,
 add column verification text not null default 'needs_verification' check (verification in ('verified','needs_verification'));
alter table public.opportunity_requirements add constraint requirement_verified_source check (verification <> 'verified' or (source_reference is not null and source_reference->>'verified_at' is not null));
create table public.opportunity_rules (
 id uuid primary key default gen_random_uuid(),
 opportunity_id uuid not null references public.opportunities(id) on delete cascade,
 version integer not null check (version > 0),
 label text not null,
 explanation text not null,
 mandatory boolean not null default true,
 expression jsonb not null check (jsonb_typeof(expression)='object'),
 source_reference jsonb not null check (jsonb_typeof(source_reference)='object' and source_reference ?& array['url','publisher','title','verified_at']),
 verification text not null check (verification in ('verified','needs_verification')),
 is_current boolean not null default true,
 check (verification <> 'verified' or source_reference->>'verified_at' is not null)
);
create index opportunity_rules_parent_idx on public.opportunity_rules(opportunity_id,is_current);
alter table public.opportunity_rules enable row level security;
revoke all on public.opportunity_rules from public, anon, authenticated;
grant select on public.opportunity_rules to authenticated;
create policy opportunity_rules_read on public.opportunity_rules for select to authenticated using (true);
-- Trusted maintainer changes are audited, without storing club data or documents.
create table private.opportunity_audit (
 id bigint generated always as identity primary key,
 table_name text not null, record_id uuid not null, operation text not null,
 changed_at timestamptz not null default clock_timestamp(),
 database_actor text not null, before_row jsonb, after_row jsonb
);
revoke all on private.opportunity_audit from public, anon, authenticated;
create function private.audit_opportunity() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into private.opportunity_audit(table_name,record_id,operation,database_actor,before_row,after_row)
 values(TG_TABLE_NAME,coalesce(new.id,old.id),TG_OP,session_user,
 case when TG_OP <> 'INSERT' then to_jsonb(old) end,
 case when TG_OP <> 'DELETE' then to_jsonb(new) end);
 return coalesce(new,old);
end $$;
revoke all on function private.audit_opportunity() from public, anon, authenticated;
create trigger opportunities_audit after insert or update or delete on public.opportunities for each row execute function private.audit_opportunity();
create trigger opportunity_requirements_audit after insert or update or delete on public.opportunity_requirements for each row execute function private.audit_opportunity();
create trigger opportunity_rules_audit after insert or update or delete on public.opportunity_rules for each row execute function private.audit_opportunity();
commit;
