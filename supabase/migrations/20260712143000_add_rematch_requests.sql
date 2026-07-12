alter table public.game_rooms
  add column if not exists rematch_room_id uuid references public.game_rooms(id) on delete set null;

create table if not exists public.game_rematch_requests (
  match_id uuid not null references public.game_matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

alter table public.game_rematch_requests enable row level security;

create table if not exists public.game_rematch_runs (
  match_id uuid primary key references public.game_matches(id) on delete cascade,
  creator_user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid references public.game_rooms(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.game_rematch_runs enable row level security;
