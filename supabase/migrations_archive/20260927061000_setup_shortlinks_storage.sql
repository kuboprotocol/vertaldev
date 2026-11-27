-- Create shortlinks storage bucket and set up policies
-- This migration sets up the storage bucket for video uploads

-- Create the storage bucket (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'shortlinks',
  'shortlinks',
  true,
  52428800, -- 50MB in bytes
  ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg']
)
on conflict (id) do update
set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/ogg'];

-- Policy: Allow public read access to shortlinks
create policy "Public can read shortlinks"
  on storage.objects
  for select
  using (bucket_id = 'shortlinks');

-- Policy: Allow authenticated users to upload their own shortlinks
create policy "Authenticated users can upload shortlinks"
  on storage.objects
  for insert
  with check (
    bucket_id = 'shortlinks'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Allow users to delete their own shortlinks
create policy "Users can delete their own shortlinks"
  on storage.objects
  for delete
  using (
    bucket_id = 'shortlinks'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy: Allow users to update their own shortlinks metadata
create policy "Users can update their own shortlinks"
  on storage.objects
  for update
  using (
    bucket_id = 'shortlinks'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
