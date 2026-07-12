alter table public.game_rooms
  add column if not exists host_last_seen_at timestamptz not null default now(),
  add column if not exists guest_last_seen_at timestamptz;

create index if not exists game_rooms_presence_idx
  on public.game_rooms (status, host_last_seen_at, guest_last_seen_at);
