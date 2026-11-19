begin;
-- One shared cooldown per club, not per browser/account. No client table access.
create table private.readiness_requests (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 requested_at timestamptz not null
);
alter table private.readiness_requests enable row level security;
revoke all on private.readiness_requests from public,anon,authenticated,service_role;

create function public.request_readiness_assessment(p_club uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare requested timestamptz; accepted boolean; retry integer;
begin
 if auth.uid() is null or not private.is_member(p_club) then
  raise exception 'Club access denied' using errcode='42501';
 end if;
 -- Follow membership administration's club-before-membership lock order.
 perform 1 from public.clubs where id=p_club for key share;
 -- Lock the live membership until commit. Concurrent removal serializes with
 -- authorization, rather than accepting a previously cached JWT membership.
 perform 1 from public.club_members where club_id=p_club and user_id=auth.uid() for share;
 if not found or auth.uid() is null then
  raise exception 'Club access denied' using errcode='42501';
 end if;
 insert into private.readiness_requests(club_id,requested_at) values(p_club,clock_timestamp())
 on conflict(club_id) do update set requested_at=clock_timestamp()
 where private.readiness_requests.requested_at<=clock_timestamp()-interval '60 seconds'
 returning requested_at into requested;
 accepted:=found;
 if accepted then
  perform private.enqueue_readiness(p_club);
  retry:=60;
 else
  select greatest(1,ceil(extract(epoch from (requested_at+interval '60 seconds'-clock_timestamp())))::integer)
  into retry from private.readiness_requests where club_id=p_club;
 end if;
 return jsonb_build_object('accepted',accepted,'retry_after_seconds',retry);
end $$;

create function public.readiness_lifecycle(p_club uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s private.readiness_clubs; rev bigint; completed bigint; assessed timestamptz; state text;
 pending boolean; running boolean; failed boolean;
begin
 if auth.uid() is null or not private.is_member(p_club) then
  raise exception 'Club access denied' using errcode='42501';
 end if;
 -- STABLE gives all reads the caller statement's MVCC snapshot. No locks,
 -- enqueueing, queue payloads, errors or internal identifiers are exposed.
 select * into s from private.readiness_clubs where club_id=p_club;
 select revision into rev from private.readiness_catalogue where singleton;
 select max(generation),max(finished_at) into completed,assessed
 from public.processing_jobs where club_id=p_club and status='done';
 select exists(select 1 from public.processing_jobs where club_id=p_club and status='queued' and generation>=s.generation),
 exists(select 1 from public.processing_jobs where club_id=p_club and status='running' and generation>=s.generation),
 exists(select 1 from public.processing_jobs where club_id=p_club and status='failed' and generation>=s.generation)
 into pending,running,failed;
 state:=case
  when running then 'processing'
  when pending then 'queued'
  when failed then 'failed'
  when completed is null then 'never_assessed'
  when s.club_id is null or completed<s.generation or s.catalogue_revision<rev
    or s.swept_on is distinct from (statement_timestamp() at time zone 'UTC')::date
    or exists(select 1 from public.opportunity_requirements q
      join public.readiness_requirement_mappings m on m.requirement_id=q.id
      left join public.readiness_results r on r.requirement_id=q.id and r.club_id=p_club
      where q.is_current and (r.id is null or r.generation<>s.generation
        or r.requirement_version<>q.version or r.processing_state<>'current' or r.evaluated_at is null))
   then 'stale'
  else 'up_to_date' end;
 return jsonb_build_object('state',state,'last_assessed_at',assessed);
end $$;
revoke all on function public.request_readiness_assessment(uuid),public.readiness_lifecycle(uuid)
 from public,anon,authenticated,service_role;
grant execute on function public.request_readiness_assessment(uuid),public.readiness_lifecycle(uuid) to authenticated;
commit;
