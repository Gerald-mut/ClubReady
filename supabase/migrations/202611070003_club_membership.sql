-- Invite-only membership management. Raw tokens are returned once, never stored.
-- Club-row locks serialize invite acceptance and administrator changes per club.
begin;
create table public.club_invites (
 id uuid primary key default gen_random_uuid(),
 club_id uuid not null references public.clubs(id) on delete cascade,
 role text not null check (role in ('club_admin','club_member')),
 token_hash text not null unique,
 created_by uuid not null references auth.users(id),
 expires_at timestamptz not null default (now() + interval '7 days'),
 max_uses integer not null default 1 check (max_uses = 1),
 used_at timestamptz,
 used_by uuid references auth.users(id),
 revoked_at timestamptz,
 check ((used_at is null) = (used_by is null))
);
create index club_invites_club_id_idx on public.club_invites(club_id);
alter table public.club_invites enable row level security;
revoke all on public.club_invites from public, anon, authenticated;
-- Column grants deliberately exclude token_hash and used_by. SELECT * is denied.
grant select(id,club_id,role,created_by,expires_at,max_uses,used_at,revoked_at)
 on public.club_invites to authenticated;
create policy invites_read on public.club_invites for select to authenticated
 using (private.is_admin(club_id));
-- Creation and revocation use checked RPCs, never direct client writes.
create function public.create_club_invite(p_club_id uuid, p_role text) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
 perform 1 from public.clubs where id=p_club_id for update;
 if auth.uid() is null or not private.is_admin(p_club_id) then
  raise exception 'Club administrator required' using errcode='42501';
 end if;
 if p_role is null or p_role not in ('club_admin','club_member') then
  raise exception 'Invalid membership role' using errcode='23514';
 end if;
 token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
 insert into public.club_invites(club_id,role,token_hash,created_by)
 values(p_club_id,p_role,encode(sha256(convert_to(token,'UTF8')),'hex'),auth.uid());
 return token;
end $$;
create function public.accept_club_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare invitation public.club_invites; target uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_token is null or length(p_token) <> 64 then
  raise exception 'Invalid or unavailable invite' using errcode='23514';
 end if;
 select club_id into target from public.club_invites
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex');
 -- Always acquire the club lock before the invite lock, matching revocation.
 perform 1 from public.clubs where id=target for update;
 select * into invitation from public.club_invites
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if not found or invitation.revoked_at is not null or invitation.expires_at <= clock_timestamp() then
  raise exception 'Invalid or unavailable invite' using errcode='23514';
 end if;
 if invitation.used_at is not null then
  if invitation.used_by=auth.uid() and exists(select 1 from public.club_members
    where club_id=invitation.club_id and user_id=auth.uid()) then return invitation.club_id; end if;
  raise exception 'Invalid or unavailable invite' using errcode='23514';
 end if;
 -- Existing members keep their current role; an invite cannot promote them.
 if exists(select 1 from public.club_members where club_id=invitation.club_id and user_id=auth.uid()) then
  return invitation.club_id;
 end if;
 insert into public.club_members(club_id,user_id,role) values(invitation.club_id,auth.uid(),invitation.role);
 update public.club_invites set used_at=clock_timestamp(),used_by=auth.uid() where id=invitation.id;
 return invitation.club_id;
end $$;
create function public.revoke_club_invite(p_invite_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
 select club_id into target from public.club_invites where id=p_invite_id;
 perform 1 from public.clubs where id=target for update;
 if auth.uid() is null or target is null or not private.is_admin(target) then
  raise exception 'Club administrator required' using errcode='42501';
 end if;
 update public.club_invites set revoked_at=coalesce(revoked_at,clock_timestamp()) where id=p_invite_id;
end $$;
create function public.set_member_role(p_club_id uuid,p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
 perform 1 from public.clubs where id=p_club_id for update;
 if auth.uid() is null or not private.is_admin(p_club_id) then
  raise exception 'Club administrator required' using errcode='42501';
 end if;
 if p_role is null or p_role not in ('club_admin','club_member') then
  raise exception 'Invalid membership role' using errcode='23514';
 end if;
 select role into previous from public.club_members where club_id=p_club_id and user_id=p_user_id;
 if not found then raise exception 'Member not found' using errcode='23514'; end if;
 if previous='club_admin' and p_role='club_member' and
  (select count(*) from public.club_members where club_id=p_club_id and role='club_admin') <= 1 then
  raise exception 'Cannot demote the last administrator' using errcode='23514';
 end if;
 update public.club_members set role=p_role where club_id=p_club_id and user_id=p_user_id;
end $$;
create function public.remove_member(p_club_id uuid,p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare previous text;
begin
 perform 1 from public.clubs where id=p_club_id for update;
 if auth.uid() is null or not private.is_admin(p_club_id) then
  raise exception 'Club administrator required' using errcode='42501';
 end if;
 select role into previous from public.club_members where club_id=p_club_id and user_id=p_user_id;
 if not found then raise exception 'Member not found' using errcode='23514'; end if;
 if previous='club_admin' and
  (select count(*) from public.club_members where club_id=p_club_id and role='club_admin') <= 1 then
  raise exception 'Cannot remove the last administrator' using errcode='23514';
 end if;
 delete from public.club_members where club_id=p_club_id and user_id=p_user_id;
end $$;
revoke all on function public.create_club_invite(uuid,text), public.accept_club_invite(text),
 public.revoke_club_invite(uuid), public.set_member_role(uuid,uuid,text), public.remove_member(uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.create_club_invite(uuid,text), public.accept_club_invite(text),
 public.revoke_club_invite(uuid), public.set_member_role(uuid,uuid,text), public.remove_member(uuid,uuid)
 to authenticated;
-- Preserve the original membership RLS and deny every direct client write.
revoke insert,update,delete on public.club_members from public,anon,authenticated;
commit;
