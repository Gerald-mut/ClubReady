-- Step 7: explicitly provision private evidence storage without changing prior migrations.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('club-evidence','club-evidence',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

-- No UPDATE policy: uploads cannot overwrite existing documents. Administrators
-- can remove orphan uploads even when metadata creation failed.
drop policy if exists club_files_read on storage.objects;
drop policy if exists club_files_upload on storage.objects;
drop policy if exists club_files_delete on storage.objects;
create policy club_files_read on storage.objects for select to authenticated
using (bucket_id='club-evidence' and private.storage_member(name));
create policy club_files_upload on storage.objects for insert to authenticated
with check (bucket_id='club-evidence' and private.storage_member(name,true)
 and owner_id=(select auth.uid())::text
 and name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png)$');
create policy club_files_delete on storage.objects for delete to authenticated
using (bucket_id='club-evidence' and private.storage_member(name,true));
commit;
