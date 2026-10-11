-- Video Library (web build): one synced document per account.
--
-- Run once in the Supabase SQL editor. Safe to run again.
--
-- The web build keeps its library in the browser. Signed in, it also keeps a
-- copy of the records here (what was watched, where it stopped, history,
-- favourites, theme) so another browser can pick them up. The copy is one JSON
-- document per person, merged in the browser by src/shared/sync.js: the same
-- shape and rules as the desktop app's Google Drive backup.

create table if not exists public.libraries (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null,
  updated_at timestamptz not null default now(),
  -- A library is a few hundred KB at most. This stops the table being used as
  -- free storage by anyone with an account.
  constraint libraries_data_size check (pg_column_size(data) < 4000000)
);

-- Everything below is what keeps one person's library from another's. The anon
-- key ships in the page, so the table is only as private as these rules.
alter table public.libraries enable row level security;

-- Signed-out visitors have no business here at all.
revoke all on public.libraries from anon;
grant select, insert, update, delete on public.libraries to authenticated;

drop policy if exists "read your own library" on public.libraries;
create policy "read your own library" on public.libraries
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "create your own library" on public.libraries;
create policy "create your own library" on public.libraries
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "update your own library" on public.libraries;
create policy "update your own library" on public.libraries
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "delete your own library" on public.libraries;
create policy "delete your own library" on public.libraries
  for delete to authenticated
  using ((select auth.uid()) = user_id);
