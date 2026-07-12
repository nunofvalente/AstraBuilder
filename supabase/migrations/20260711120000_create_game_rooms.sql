create table if not exists public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  guest_user_id uuid references auth.users(id) on delete set null,
  host_deck_id text not null,
  guest_deck_id text,
  status text not null default 'waiting' check (status in ('waiting', 'ready', 'playing', 'finished')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours'),
  check (guest_user_id is null or guest_user_id <> host_user_id)
);

create index if not exists game_rooms_host_user_id_idx on public.game_rooms (host_user_id);
create index if not exists game_rooms_guest_user_id_idx on public.game_rooms (guest_user_id);
create index if not exists game_rooms_expires_at_idx on public.game_rooms (expires_at);

alter table public.game_rooms enable row level security;

create policy "Room participants can read their rooms"
  on public.game_rooms for select
  using (auth.uid() = host_user_id or auth.uid() = guest_user_id);

alter publication supabase_realtime add table public.game_rooms;
