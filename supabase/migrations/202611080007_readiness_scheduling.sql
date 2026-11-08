begin;
-- Aggregate observability only; no evidence, club identifiers or error contents.
create function public.readiness_health() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object(
  'queued', (select count(*) from public.processing_jobs where status='queued'),
  'due', (select count(*) from public.processing_jobs where status='queued' and run_after<=clock_timestamp()),
  'failed', (select count(*) from public.processing_jobs where status='failed'),
  'oldest_due_seconds', (select coalesce(extract(epoch from clock_timestamp()-min(run_after)),0)::bigint from public.processing_jobs where status='queued' and run_after<=clock_timestamp()),
  'catalogue_pending', (select count(*) from public.clubs c left join private.readiness_clubs s on s.club_id=c.id where s.club_id is null or s.catalogue_revision<(select revision from private.readiness_catalogue)),
  'sweep_pending', (select count(*) from public.clubs c left join private.readiness_clubs s on s.club_id=c.id where s.swept_on is distinct from (clock_timestamp() at time zone 'UTC')::date),
  'last_completed_at', (select max(finished_at) from public.processing_jobs where status='done')
 );
$$;
revoke all on function public.readiness_health() from public,anon,authenticated,service_role;
grant execute on function public.readiness_health() to readiness_worker;
commit;
