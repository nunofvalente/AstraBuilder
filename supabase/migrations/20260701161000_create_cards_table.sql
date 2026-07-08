create table if not exists public.cards (
  id text primary key,
  name text,
  affinity text,
  artist text,
  rarity text,
  number integer,
  type text,
  subtype text,
  cost integer,
  attack integer,
  health integer,
  influence integer,
  rules_text text,
  description text,
  image_url text,
  raw_payload jsonb,
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cards_name_idx on public.cards (name);
create index if not exists cards_type_idx on public.cards (type);
create index if not exists cards_affinity_idx on public.cards (affinity);

alter table public.cards enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'cards'
      and policyname = 'Cards are publicly readable'
  ) then
    create policy "Cards are publicly readable"
      on public.cards
      for select
      using (true);
  end if;
end $$;

