\set ON_ERROR_STOP on
begin;
do $$
declare h jsonb; after_event jsonb; r text; c uuid:=gen_random_uuid();
begin
 h:=public.readiness_health();
 if not (h ?& array['queued','due','failed','oldest_due_seconds','catalogue_pending','sweep_pending','last_completed_at']) then
  raise exception 'Missing health fields'; end if;
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'public.readiness_health()','execute') then
   raise exception 'Client health access: %',r; end if;
 end loop;
 insert into public.clubs(id,name,county) values(c,'Scheduler health fixture','Nairobi');
 after_event:=public.readiness_health();
 if (after_event->>'queued')::bigint<>(h->>'queued')::bigint+1
 or (after_event->>'due')::bigint<>(h->>'due')::bigint+1
 or (after_event->>'sweep_pending')::bigint<>(h->>'sweep_pending')::bigint+1
 or (after_event->>'catalogue_pending')::bigint<>(h->>'catalogue_pending')::bigint+1 then
  raise exception 'Health did not observe committed-in-transaction source event'; end if;
 if not has_function_privilege('readiness_worker','public.readiness_health()','execute') then
  raise exception 'Worker lacks health access'; end if;
end $$;
set local role readiness_worker;
select public.readiness_health();
reset role;
rollback;
\echo 'PASS scheduling health shape, restricted roles and worker execution'
