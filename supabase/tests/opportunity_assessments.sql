\set QUIET 1
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege or check_violation then return; end;
 raise exception 'FAIL: expected rejection: %',label;
end $$;
select pg_temp.assert_true((select count(*)=5 and count(distinct slug)=5 from public.opportunities where is_listed),'five distinct listed programmes after repeated seeds');
select pg_temp.assert_true((select opportunity_type='fundraising_platform' and status='unconfirmed' and application_url is null from public.opportunities where slug='globalgiving-pathway'),'GlobalGiving platform and unconfirmed route');
select pg_temp.assert_true((select not is_listed from public.opportunities where id='60000000-0000-0000-0000-000000000003'),'legacy Laureus retained as archive');
select pg_temp.assert_true(not exists(select 1 from public.opportunity_rules where verification='verified' and source_reference->>'verified_at' is null),'review timestamp for verified rules');
select pg_temp.assert_true(not exists(select 1 from public.opportunity_requirements where opportunity_id='60000000-0000-0000-0000-000000000004' and is_current),'no child identity or consent checklist');
select pg_temp.assert_true((select count(*) > 0 from private.opportunity_audit),'trusted curation audited');
set local role authenticated;
select pg_temp.assert_true((select count(distinct opportunity_id)=5 from public.opportunity_rules where is_current),'rules readable across catalogue');
select pg_temp.denied('update public.opportunity_rules set verification=''verified''','clients cannot mark rules verified');
select pg_temp.denied('insert into public.opportunity_rules default values','client rule insert denied');
select pg_temp.denied('delete from public.opportunity_rules','client rule deletion denied');
select pg_temp.denied('select * from private.opportunity_audit','audit not client-readable');
set local role anon;
select pg_temp.denied('select * from public.opportunity_rules','anonymous rules denied');
reset role;
rollback;
\echo 'Opportunity assessment SQL assertions passed (fixtures rolled back).'
