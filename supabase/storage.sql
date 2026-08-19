insert into storage.buckets (id, name, public)
values ('medical-photos', 'medical-photos', false)
on conflict (id) do nothing;

drop policy if exists "own medical photos" on storage.objects;
create policy "own medical photos" on storage.objects
  for all using (
    bucket_id = 'medical-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from family_members where owner_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'medical-photos'
    and (storage.foldername(name))[1]::uuid in (
      select id from family_members where owner_id = auth.uid()
    )
  );
