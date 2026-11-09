-- Include only inside a rollback-only transaction. Keep real worker selection,
-- preparation, evaluation and privilege checks; defer unrelated jobs locally.
create temporary table readiness_fixture_clubs(club_id uuid primary key);
create function pg_temp.defer_unrelated_readiness() returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Preparation can bootstrap existing clubs and enqueue catalogue/expiry work.
 -- Exhaust bounded fanout before deferring it so the worker cannot recreate it.
 while private.prepare_readiness(1000)>0 loop end loop;
 update public.processing_jobs set run_after=clock_timestamp()+interval '100 years'
 where status='queued' and club_id not in (select club_id from pg_temp.readiness_fixture_clubs);
end $$;
create function pg_temp.process_fixture_job() returns uuid
language plpgsql as $$
begin
 perform pg_temp.defer_unrelated_readiness();
 return public.process_next_job();
end $$;
