begin;
-- Infrastructure authenticates with a separately provisioned database login which
-- is a member of this NOLOGIN role. No browser/JWT or service_role grant.
create role readiness_worker nologin;
grant readiness_worker to postgres;
create index processing_jobs_club_generation on public.processing_jobs(club_id,generation desc);
create table private.readiness_catalogue (
 singleton boolean primary key default true check(singleton), revision bigint not null default 1
);
insert into private.readiness_catalogue values(true,1);
create table private.readiness_clubs (
 club_id uuid primary key references public.clubs(id) on delete cascade,
 generation bigint not null default 0,
 catalogue_revision bigint not null default 0
);
create table private.readiness_settings (
 singleton boolean primary key default true check(singleton),
 expiring_days integer not null default 30 check(expiring_days between 0 and 3650)
);
insert into private.readiness_settings values(true,30);
revoke all on private.readiness_catalogue,private.readiness_clubs,private.readiness_settings from public,anon,authenticated,service_role;

create function private.enqueue_readiness(p_club uuid) returns void
language plpgsql security definer set search_path='' as $$
declare g bigint;
begin
 insert into private.readiness_clubs(club_id,generation)
 select p_club,greatest(coalesce((select max(generation) from public.processing_jobs where club_id=p_club),0),
 coalesce((select max(generation) from public.readiness_results where club_id=p_club),0)) on conflict do nothing;
 update private.readiness_clubs set generation=generation+1 where club_id=p_club returning generation into g;
 insert into public.processing_jobs(club_id,generation,max_attempts) values(p_club,g,5)
 on conflict(club_id,job_type) where status='queued' do update
 set generation=excluded.generation, updated_at=clock_timestamp();
 update public.readiness_results set processing_state='stale',status='unknown',applicability='unknown',reason='source_changed' where club_id=p_club and processing_state<>'never_assessed';
end $$;
create function private.readiness_club_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='clubs' then
  perform private.enqueue_readiness(new.id);
 elsif tg_op='DELETE' then
  if exists(select 1 from public.clubs where id=old.club_id) then perform private.enqueue_readiness(old.club_id); end if;
 else
  if tg_op='UPDATE' and old.club_id is distinct from new.club_id then
   perform private.enqueue_readiness(old.club_id);
  end if;
  perform private.enqueue_readiness(new.club_id);
 end if;
 return null;
end $$;
create trigger readiness_club_created after insert on public.clubs for each row execute function private.readiness_club_event();
create trigger readiness_club_changed after update of name,county,sub_county,year_established,description,contact_email on public.clubs for each row execute function private.readiness_club_event();
create trigger readiness_evidence_changed after insert or update or delete on public.evidence for each row execute function private.readiness_club_event();
create trigger readiness_activity_changed after insert or update or delete on public.activities for each row execute function private.readiness_club_event();
create function private.readiness_catalogue_event() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update private.readiness_catalogue set revision=revision+1;
 return null;
end $$;
create trigger readiness_requirement_changed after insert or update or delete on public.opportunity_requirements for each statement execute function private.readiness_catalogue_event();
create trigger readiness_settings_changed after update on private.readiness_settings for each statement execute function private.readiness_catalogue_event();
create trigger readiness_mapping_changed after insert or update or delete on public.readiness_requirement_mappings for each statement execute function private.readiness_catalogue_event();

-- Bounded bootstrap, catalogue invalidation and daily expiry sweep. Invocation
-- does not activate a schedule. A club is due again at the next UTC date.
alter table private.readiness_clubs add column swept_on date;
create function private.prepare_readiness(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare c record; rev bigint; n integer:=0;
begin
 if p_limit not between 1 and 1000 then raise exception 'Invalid batch size'; end if;
 -- Hold a shared catalogue lock through evaluation/commit. Curators serialize
 -- revision changes against evaluations; concurrent workers share this lock.
 select revision into rev from private.readiness_catalogue for share;
 -- Bootstrap without touching every club in a migration or catalogue trigger.
 insert into private.readiness_clubs(club_id,generation)
 select id,greatest(coalesce((select max(generation) from public.processing_jobs where club_id=bc.id),0),
 coalesce((select max(generation) from public.readiness_results where club_id=bc.id),0)) from public.clubs bc where not exists(select 1 from private.readiness_clubs s where s.club_id=bc.id)
 order by id limit p_limit on conflict do nothing;
 for c in select * from private.readiness_clubs
 where catalogue_revision<rev or swept_on is distinct from (clock_timestamp() at time zone 'UTC')::date
 order by club_id limit p_limit for update skip locked loop
  perform private.enqueue_readiness(c.club_id);
  update private.readiness_clubs set catalogue_revision=rev,swept_on=(clock_timestamp() at time zone 'UTC')::date where club_id=c.club_id;
  n:=n+1;
 end loop;
 return n;
end $$;

create function private.evaluate_readiness(p_club uuid,p_generation bigint) returns void
language plpgsql set search_path='' as $$
declare r record; c jsonb; rid uuid; st text; app text; why text;
 ids uuid[]; valid_count integer; known_count integer; total_count integer; stable_count integer;
 today date:=(clock_timestamp() at time zone 'UTC')::date; horizon integer;
begin
 select to_jsonb(t) into c from public.clubs t where id=p_club;
 select expiring_days into horizon from private.readiness_settings;
 delete from public.readiness_results x where x.club_id=p_club and not exists
 (select 1 from public.opportunity_requirements q where q.id=x.requirement_id and q.is_current);
 for r in select q.*,m.mapping_type,m.activity_type,m.club_fields,m.min_count as mapped_count
 from public.opportunity_requirements q left join public.readiness_requirement_mappings m on m.requirement_id=q.id
 where q.is_current order by q.id loop
  -- Missing mappings cannot satisfy Phase B's result FK. Trusted curation is
  -- required before an assessment can exist; no mapping is fabricated here.
  if r.mapping_type is null then continue; end if;
  ids:='{}'; st:='unknown'; app:='unknown'; why:='unsupported_or_unverified_or_conditional';
  if r.mapping_type<>'unsupported' and r.verification='verified' and r.condition is null then
   app:='applicable';
   if r.mapping_type='document' then
    select coalesce(array_agg(e.id order by e.id),'{}'),count(*),
     count(*) filter(where expires_at is not null),
     count(*) filter(where expires_at>=today),
     count(*) filter(where expires_at>today+horizon)
    into ids,total_count,known_count,valid_count,stable_count
    from public.evidence e where e.club_id=p_club and e.document_type=r.document_type;
    -- Null expiry does not prove currency. Prefer enough stable records, then
    -- enough current records. Unknown records can resolve an otherwise short count.
    st:=case when stable_count>=r.mapped_count then 'supplied'
     when valid_count>=r.mapped_count then 'expiring'
     when valid_count+total_count-known_count>=r.mapped_count then 'unknown'
     when total_count>=r.mapped_count then 'expired' else 'not_supplied' end;
    why:='document_count_and_utc_expiry';
   elsif r.mapping_type='activity' then
    select coalesce(array_agg(a.id order by a.id),'{}'),count(*) into ids,total_count
    from public.activities a where a.club_id=p_club and a.activity_type=r.activity_type;
    st:=case when total_count>=r.mapped_count then 'supplied' else 'not_supplied' end;
    why:='persisted_activity_count';
   elsif r.mapping_type='club_info' then
    st:=case when exists(select 1 from unnest(r.club_fields) f where nullif(btrim(c->>f),'') is null)
     then 'not_supplied' else 'supplied' end;
    why:='explicit_profile_fields';
   end if;
  end if;
  insert into public.readiness_results(club_id,opportunity_id,requirement_id,requirement_version,status,applicability,reason,evaluated_at,processing_state,generation)
  values(p_club,r.opportunity_id,r.id,r.version,st,app,why,clock_timestamp(),'current',p_generation)
  on conflict(club_id,requirement_id) do update set status=excluded.status,applicability=excluded.applicability,
   reason=excluded.reason,evaluated_at=excluded.evaluated_at,processing_state='current',generation=excluded.generation
  where public.readiness_results.generation<=excluded.generation returning id into rid;
  if rid is null then raise exception 'Generation regression'; end if;
  delete from public.readiness_result_evidence where result_id=rid;
  if r.mapping_type='document' then
   insert into public.readiness_result_evidence(result_id,club_id,evidence_id) select rid,p_club,unnest(ids);
  elsif r.mapping_type='activity' then
   insert into public.readiness_result_evidence(result_id,club_id,activity_id) select rid,p_club,unnest(ids);
  end if;
 end loop;
end $$;

create function public.process_next_job() returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.processing_jobs; s record;
begin
 -- EXECUTE is granted solely to the infrastructure role and owner. SECURITY
 -- DEFINER is needed for RLS-protected source reads, never browser authorization.
 perform private.prepare_readiness(100);
 -- Lock state before job: enqueue uses the same ordering. SKIP LOCKED allows
 -- other clubs to proceed while a worker or an event holds this club's state.
 select cs.* into s from private.readiness_clubs cs where exists
 (select 1 from public.processing_jobs p where p.club_id=cs.club_id and p.status='queued' and p.run_after<=clock_timestamp())
 order by cs.club_id limit 1 for update skip locked;
 if not found then return null; end if;
 select * into j from public.processing_jobs where club_id=s.club_id and status='queued' and run_after<=clock_timestamp()
 order by created_at limit 1 for update skip locked;
 if not found then return null; end if;
 -- Phase B permitted max_attempts up to 100. Never grant an extra attempt
 -- to a legacy/imported queued job which has already reached our ceiling.
 if j.attempts>=least(j.max_attempts,5) then
  update public.processing_jobs set status='failed',finished_at=clock_timestamp(),
   updated_at=clock_timestamp(),last_error='attempt_limit' where id=j.id;
  return j.id;
 end if;
 update public.processing_jobs set status='running',attempts=attempts+1,claimed_generation=generation,
 locked_at=clock_timestamp(),updated_at=clock_timestamp() where id=j.id;
 begin
  perform private.evaluate_readiness(j.club_id,j.generation);
  update public.processing_jobs set status='done',locked_at=null,finished_at=clock_timestamp(),updated_at=clock_timestamp(),last_error=null where id=j.id;
 exception when others then
  -- Never store SQLERRM, SQL text, evidence metadata or contents.
  update public.processing_jobs set status=case when attempts>=least(max_attempts,5) then 'failed' else 'queued' end,
   locked_at=null,finished_at=case when attempts>=least(max_attempts,5) then clock_timestamp() end,
   last_error='evaluation_error:'||sqlstate,run_after=clock_timestamp()+make_interval(secs=>least(3600,5*(2^least(attempts-1,10))::integer)),
   updated_at=clock_timestamp() where id=j.id;
  -- Do not touch results in this handler: a broken result constraint/trigger
  -- must not prevent durable retry bookkeeping. Prior snapshots remain stale.
 end;
 return j.id;
end $$;
revoke all on function private.enqueue_readiness(uuid),private.readiness_club_event(),private.readiness_catalogue_event(),private.prepare_readiness(integer),private.evaluate_readiness(uuid,bigint),public.process_next_job() from public,anon,authenticated,service_role;
grant execute on function public.process_next_job() to readiness_worker;
commit;
