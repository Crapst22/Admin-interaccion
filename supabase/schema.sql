-- Torneo de riesgos - esquema completo (pegar en SQL Editor de Supabase)
create extension if not exists pgcrypto;

-- ENUMS
do $$ begin create type session_status as enum ('waiting','running','finished'); exception when duplicate_object then null; end $$;
do $$ begin create type match_status as enum ('pending','voting','done'); exception when duplicate_object then null; end $$;
do $$ begin create type vote_choice as enum ('a','b'); exception when duplicate_object then null; end $$;

-- TABLAS
create table if not exists public.brackets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  name text not null,
  image_url text not null,
  position int not null default 0
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  bracket_id uuid not null references public.brackets(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status session_status not null default 'waiting',
  duration_seconds int not null default 30,
  current_match_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  round int not null,
  slot int not null,
  item_a_id uuid references public.items(id) on delete set null,
  item_b_id uuid references public.items(id) on delete set null,
  winner_id uuid references public.items(id) on delete set null,
  votes_a int not null default 0,
  votes_b int not null default 0,
  status match_status not null default 'pending',
  voting_ends_at timestamptz,
  next_match_id uuid references public.matches(id) on delete set null,
  next_slot text check (next_slot in ('a','b')),
  is_bye boolean not null default false,
  tie_broken boolean not null default false
);

-- Compatibilidad si la tabla ya existía
alter table public.matches add column if not exists is_bye boolean not null default false;
alter table public.matches add column if not exists tie_broken boolean not null default false;

alter table public.sessions
  drop constraint if exists sessions_current_match_fkey,
  add constraint sessions_current_match_fkey foreign key (current_match_id) references public.matches(id) on delete set null;

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  device_id text not null,
  choice vote_choice not null,
  created_at timestamptz not null default now(),
  constraint votes_match_device_unique unique (match_id, device_id)
);

-- INDICES
create index if not exists idx_items_bracket on public.items(bracket_id);
create index if not exists idx_sessions_bracket on public.sessions(bracket_id);
create index if not exists idx_matches_session on public.matches(session_id);

-- RLS
alter table public.brackets enable row level security;
alter table public.items enable row level security;
alter table public.sessions enable row level security;
alter table public.matches enable row level security;
alter table public.votes enable row level security;

-- brackets: solo dueño
drop policy if exists "brackets_owner_select" on public.brackets;
create policy "brackets_owner_select" on public.brackets for select using (auth.uid() = owner_id);
drop policy if exists "brackets_owner_insert" on public.brackets;
create policy "brackets_owner_insert" on public.brackets for insert with check (auth.uid() = owner_id);
drop policy if exists "brackets_owner_update" on public.brackets;
create policy "brackets_owner_update" on public.brackets for update using (auth.uid() = owner_id);
drop policy if exists "brackets_owner_delete" on public.brackets;
create policy "brackets_owner_delete" on public.brackets for delete using (auth.uid() = owner_id);

-- items: dueño CRUD, lectura pública (para votantes)
drop policy if exists "items_owner_all" on public.items;
create policy "items_owner_all" on public.items for all using (
  exists (select 1 from public.brackets b where b.id = bracket_id and b.owner_id = auth.uid())
) with check (
  exists (select 1 from public.brackets b where b.id = bracket_id and b.owner_id = auth.uid())
);
drop policy if exists "items_public_read" on public.items;
create policy "items_public_read" on public.items for select using (true);

-- sessions: dueño CRUD, lectura pública del estado
drop policy if exists "sessions_owner_all" on public.sessions;
create policy "sessions_owner_all" on public.sessions for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
drop policy if exists "sessions_public_read" on public.sessions;
create policy "sessions_public_read" on public.sessions for select using (true);

-- matches: dueño CRUD, lectura pública
drop policy if exists "matches_owner_all" on public.matches;
create policy "matches_owner_all" on public.matches for all using (
  exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid())
) with check (
  exists (select 1 from public.sessions s where s.id = session_id and s.owner_id = auth.uid())
);
drop policy if exists "matches_public_read" on public.matches;
create policy "matches_public_read" on public.matches for select using (true);

-- votes: NADIE lee/escribe desde el cliente (device_id sensible). Solo service role en servidor.

-- STORAGE: bucket público para imágenes
insert into storage.buckets (id, name, public)
values ('images', 'images', true)
on conflict (id) do update set public = true;

drop policy if exists "images_public_read" on storage.objects;
create policy "images_public_read" on storage.objects for select using (bucket_id = 'images');
drop policy if exists "images_auth_insert" on storage.objects;
create policy "images_auth_insert" on storage.objects for insert to authenticated with check (bucket_id = 'images');
drop policy if exists "images_auth_update" on storage.objects;
create policy "images_auth_update" on storage.objects for update to authenticated using (bucket_id = 'images');
drop policy if exists "images_auth_delete" on storage.objects;
create policy "images_auth_delete" on storage.objects for delete to authenticated using (bucket_id = 'images');

-- VOTO ATÓMICO (RPC llamada con service role desde /api/vote)
create or replace function public.cast_vote(p_match_id uuid, p_device_id text, p_choice vote_choice)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_match record;
begin
  select id, status, voting_ends_at into v_match
  from public.matches where id = p_match_id for update;

  if not found then
    return json_build_object('ok', false, 'error', 'El enfrentamiento no existe.');
  end if;
  if v_match.status <> 'voting' then
    return json_build_object('ok', false, 'error', 'La votación no está activa en este enfrentamiento.');
  end if;
  if v_match.voting_ends_at is null or now() > v_match.voting_ends_at then
    return json_build_object('ok', false, 'error', 'El tiempo de votación ya terminó.');
  end if;

  begin
    insert into public.votes(match_id, device_id, choice) values (p_match_id, p_device_id, p_choice);
  exception when unique_violation then
    return json_build_object('ok', false, 'error', 'Ya registraste tu voto en este enfrentamiento.');
  end;

  if p_choice = 'a' then
    update public.matches set votes_a = votes_a + 1 where id = p_match_id;
  else
    update public.matches set votes_b = votes_b + 1 where id = p_match_id;
  end if;

  return json_build_object('ok', true);
end;
$$;

revoke all on function public.cast_vote(uuid, text, vote_choice) from public, anon, authenticated;

-- REALTIME: publicar matches y sessions (ajuste solicitado)
do $$ begin
  alter publication supabase_realtime add table public.matches, public.sessions;
exception when duplicate_object then null; when others then null; end $$;
