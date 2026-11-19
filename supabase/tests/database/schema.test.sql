begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select has_table('public', 'activities', 'Current activity table exists');
select has_table('public', 'activity_attachments', 'Attachment metadata exists');
select has_table('public', 'evidence', 'Current evidence table exists');
select has_table('public', 'club_invites', 'Invitation contract exists');
select has_table('public', 'opportunity_requirements', 'Versioned requirements exist');
select has_table('public', 'opportunity_rules', 'Sourced rules exist');
select has_table('public', 'application_tracking', 'Tracking contract exists');
select has_column('public', 'club_members', 'joined_at', 'Frontend membership ordering exists');
select has_column('public', 'activities', 'date', 'Frontend calendar date contract exists');
select is((select count(*) from public.opportunities where is_listed), 5::bigint,
          'Configured curated seed lists five programmes after repeat seed');

select * from finish();
rollback;
