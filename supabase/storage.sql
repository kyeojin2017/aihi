insert into storage.buckets (id, name, public)
values ('medical-photos', 'medical-photos', false)
on conflict (id) do nothing;

-- Scoped by auth.uid() (not family_members.id) since family_members isn't
-- seeded yet — every logged-in user's own folder, family members are just
-- subfolders keyed by the app's local memberId ("self"/"spouse"/...).
drop policy if exists "own medical photos" on storage.objects;
create policy "own medical photos" on storage.objects
  for all using (
    bucket_id = 'medical-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'medical-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
