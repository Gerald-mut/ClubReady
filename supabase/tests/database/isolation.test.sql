-- Proves: one club cannot read or write another club's data, sync is idempotent,
-- the outbox is coalesced, and anon / outbox tables are locked down.
begin;
select plan(11);

-- Setup as superuser: two users, two clubs
insert into auth.users (id, email) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a@test.local'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'b@test.local');

insert into public.clubs (id, name, created_by) values
  ('10000000-0000-0000-0000-00000000000a', 'Club A', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  ('20000000-0000-0000-0000-00000000000b', 'Club B', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');

insert into public.club_members (club_id, user_id, role) values
  ('10000000-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'club_admin'),
  ('20000000-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'club_admin');

-- User A
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

select lives_ok(
  $$select public.sync_activity('10000000-0000-0000-0000-00000000000a'::uuid,
      '30000000-0000-0000-0000-000000000001'::uuid, 'Training', 'training', now(), now(), 20, 15, 8)$$,
  'A can sync an activity to their own club');

select lives_ok(
  $$select public.sync_activity('10000000-0000-0000-0000-00000000000a'::uuid,
      '30000000-0000-0000-0000-000000000001'::uuid, 'Training', 'training', now(), now(), 20, 15, 8)$$,
  'A retrying the same client_id does not error');

select is((select count(*)::int from public.activities), 1,
  'retry created no duplicate activity');

-- Back to superuser to inspect the outbox
reset role;
select is((select count(*)::int from public.processing_jobs
           where club_id = '10000000-0000-0000-0000-00000000000a'), 1,
  'exactly one pending job after sync plus retry');

-- User B
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","role":"authenticated"}', true);

select is((select count(*)::int from public.activities), 0,
  'B cannot see A''s activities');

select is((select count(*)::int from public.clubs), 1,
  'B sees only their own club');

select throws_ok(
  $$select public.sync_activity('10000000-0000-0000-0000-00000000000a'::uuid,
      '30000000-0000-0000-0000-000000000002'::uuid, 'Hack', 'training', now(), now())$$,
  '42501', null,
  'B cannot sync into A''s club');

select throws_ok(
  $$insert into public.activities (club_id, client_id, title, occurred_at, client_created_at, created_by)
    values ('10000000-0000-0000-0000-00000000000a', gen_random_uuid(), 'Direct', now(), now(),
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb')$$,
  '42501', null,
  'B cannot insert activities directly');

select throws_ok(
  $$select count(*) from public.processing_jobs$$,
  '42501', null,
  'signed-in users cannot read the outbox');

-- Anonymous
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select throws_ok(
  $$select count(*) from public.activities$$,
  '42501', null,
  'anon cannot read activities');

select throws_ok(
  $$select public.sync_activity('10000000-0000-0000-0000-00000000000a'::uuid,
      '30000000-0000-0000-0000-000000000003'::uuid, 'Anon', 'training', now(), now())$$,
  '42501', null,
  'anon cannot call sync_activity');

select * from finish();
rollback;
