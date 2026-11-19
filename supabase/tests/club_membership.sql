-- Disposable Supabase/contract database only, after all three migrations.
-- No raw invite tokens are printed. Fixtures and test helpers roll back.
\set QUIET 1
begin;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; end $$;
create function pg_temp.denied(statement text,label text) returns void language plpgsql as $$
begin
 begin execute statement; exception when insufficient_privilege or check_violation then return; end;
 raise exception 'FAIL: expected rejection: %',label;
end $$;
insert into auth.users(id) values
 ('a1000000-0000-0000-0000-000000000001'),
 ('a2000000-0000-0000-0000-000000000002'),
 ('a3000000-0000-0000-0000-000000000003');
set local role authenticated;
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true) as ignored \gset
select public.create_club('Membership test','Nairobi') as club \gset
select public.create_club_invite(:'club','club_member') as token \gset
select id as invite_id from public.club_invites where club_id=:'club' \gset
select pg_temp.assert_true((select expires_at=now()+interval '7 days' and max_uses=1 from public.club_invites where id=:'invite_id'), 'single-use seven-day default');
select pg_temp.denied('select token_hash from public.club_invites','hash hidden from admin');
select pg_temp.denied('select * from public.club_invites','wildcard cannot expose hash');
select pg_temp.denied(format('update public.club_invites set revoked_at=now() where id=%L',:'invite_id'),'direct invite update denied');
select pg_temp.denied(format('insert into public.club_invites(club_id,role,token_hash,created_by) values (%L,%L,%L,%L)',:'club','club_admin','forged','a1000000-0000-0000-0000-000000000001'),'direct invite insert denied');
select pg_temp.denied(format('select public.create_club_invite(%L,%L)',:'club','owner'),'invalid invite role');
select pg_temp.denied(format('select public.set_member_role(%L,%L,%L)',:'club','a1000000-0000-0000-0000-000000000001','club_member'),'last admin demotion');
select pg_temp.denied(format('select public.remove_member(%L,%L)',:'club','a1000000-0000-0000-0000-000000000001'),'last admin removal');
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000002',true) as ignored \gset
select pg_temp.assert_true(public.accept_club_invite(:'token')=:'club','second user joins');
select pg_temp.assert_true(public.accept_club_invite(:'token')=:'club','successful retry idempotent');
select pg_temp.assert_true((select count(*)=2 from public.club_members where club_id=:'club'),'two users share membership');
select pg_temp.assert_true((select count(*)=1 from public.clubs where id=:'club'),'member reads shared club');
select pg_temp.assert_true((select count(*)=0 from public.club_invites),'member cannot list invites');
select pg_temp.denied(format('select public.create_club_invite(%L,%L)',:'club','club_admin'),'member cannot invite');
select pg_temp.denied(format('select public.revoke_club_invite(%L)',:'invite_id'),'member cannot revoke');
select pg_temp.denied(format('select public.set_member_role(%L,%L,%L)',:'club','a2000000-0000-0000-0000-000000000002','club_admin'),'member cannot self promote');
select pg_temp.denied(format('select public.remove_member(%L,%L)',:'club','a1000000-0000-0000-0000-000000000001'),'member cannot remove');
select pg_temp.denied('update public.club_members set role=''club_admin''','direct role write denied');
select pg_temp.denied(format('insert into public.club_members(club_id,user_id,role) values (%L,%L,%L)',:'club','a3000000-0000-0000-0000-000000000003','club_admin'),'direct membership insert denied');
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true) as ignored \gset
select pg_temp.denied(format('select public.accept_club_invite(%L)',:'token'),'reused token denied to third user');
select pg_temp.assert_true((select count(*)=0 from public.clubs where id=:'club'),'unrelated club hidden');
select pg_temp.assert_true((select count(*)=0 from public.club_members where club_id=:'club'),'unrelated membership hidden');
select pg_temp.assert_true((select count(*)=0 from public.club_invites),'unrelated invites hidden');
select pg_temp.denied(format('select public.create_club_invite(%L,%L)',:'club','club_admin'),'unrelated invitation denied');
select pg_temp.denied(format('select public.set_member_role(%L,%L,%L)',:'club','a1000000-0000-0000-0000-000000000001','club_member'),'unrelated role change denied');
select pg_temp.denied(format('select public.remove_member(%L,%L)',:'club','a1000000-0000-0000-0000-000000000001'),'unrelated removal denied');
update public.clubs set name='ATTACK' where id=:'club';
select pg_temp.denied('select public.accept_club_invite(''invalid'')','invalid token denied');
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true) as ignored \gset
select pg_temp.assert_true((select name='Membership test' from public.clubs where id=:'club'),'unrelated update had no effect');
select public.create_club_invite(:'club','club_admin') as admin_token \gset
select public.create_club_invite(:'club','club_member') as revoked_token \gset
-- Trusted fixture lookup is the only place hashes are read.
reset role;
select pg_temp.assert_true((select token_hash<>:'token' and length(token_hash)=64 from public.club_invites where id=:'invite_id'),'only hash stored');
select id as revoked_id from public.club_invites where token_hash=encode(sha256(convert_to(:'revoked_token','UTF8')),'hex') \gset
set local role authenticated;
select public.revoke_club_invite(:'revoked_id');
select public.create_club_invite(:'club','club_member') as expired_token \gset
reset role;
update public.club_invites set expires_at=now()-interval '1 second'
 where token_hash=encode(sha256(convert_to(:'expired_token','UTF8')),'hex');
set local role authenticated;
select set_config('request.jwt.claim.sub','a3000000-0000-0000-0000-000000000003',true) as ignored \gset
select pg_temp.denied(format('select public.accept_club_invite(%L)',:'revoked_token'),'revoked token denied');
select pg_temp.denied(format('select public.accept_club_invite(%L)',:'expired_token'),'expired token denied');
-- An existing member accepting an admin invitation must retain their role.
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000002',true) as ignored \gset
select public.accept_club_invite(:'admin_token') as ignored \gset
select pg_temp.assert_true((select role='club_member' from public.club_members where user_id=auth.uid()),'invite cannot promote existing member');
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true) as ignored \gset
select public.set_member_role(:'club','a2000000-0000-0000-0000-000000000002','club_admin');
select public.set_member_role(:'club','a1000000-0000-0000-0000-000000000001','club_member');
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000002',true) as ignored \gset
select pg_temp.denied(format('select public.remove_member(%L,%L)',:'club','a2000000-0000-0000-0000-000000000002'),'new last admin protected');
select public.set_member_role(:'club','a1000000-0000-0000-0000-000000000001','club_admin');
select public.remove_member(:'club','a1000000-0000-0000-0000-000000000001');
select pg_temp.assert_true((select count(*)=1 from public.club_members where club_id=:'club'),'admin removes member');
-- Removed users cannot replay consumed tokens to regain membership.
select set_config('request.jwt.claim.sub','a1000000-0000-0000-0000-000000000001',true) as ignored \gset
select public.accept_club_invite(:'admin_token') as ignored \gset
select pg_temp.assert_true((select role='club_admin' from public.club_members where user_id=auth.uid()),'new recipient gets invite admin role');
select public.remove_member(:'club','a2000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub','a2000000-0000-0000-0000-000000000002',true) as ignored \gset
select pg_temp.denied(format('select public.accept_club_invite(%L)',:'token'),'removed recipient cannot replay used token');
reset role;
select pg_temp.assert_true(not exists (
 select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in
 ('create_club_invite','accept_club_invite','revoke_club_invite','set_member_role','remove_member')
 and (not p.prosecdef or not ('search_path=""'=any(p.proconfig))
   or has_function_privilege('anon',p.oid,'EXECUTE')
   or not has_function_privilege('authenticated',p.oid,'EXECUTE'))
), 'RPC search paths, security definer and execution grants');
set local role anon;
select pg_temp.denied('select public.accept_club_invite(''invalid'')','anonymous acceptance denied');
select pg_temp.denied(format('select public.create_club_invite(%L,%L)',:'club','club_admin'),'anonymous creation denied');
select pg_temp.denied('select id from public.club_invites','anonymous listing denied');
reset role;
rollback;
\echo 'Club membership SQL assertions passed (fixtures rolled back).'
