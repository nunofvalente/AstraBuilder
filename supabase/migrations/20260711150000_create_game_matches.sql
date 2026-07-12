create table if not exists public.game_matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null unique references public.game_rooms(id) on delete cascade,
  status text not null default 'setup' check (status in ('setup', 'playing', 'finished')),
  revision integer not null default 0,
  host_deck_snapshot jsonb not null,
  guest_deck_snapshot jsonb not null,
  host_setup jsonb not null,
  guest_setup jsonb not null,
  first_player text check (first_player in ('host', 'guest')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_matches enable row level security;
