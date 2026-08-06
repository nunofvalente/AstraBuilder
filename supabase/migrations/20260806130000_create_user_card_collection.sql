create table if not exists public.user_card_collection (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  quantity integer not null default 1 check (quantity between 1 and 999),
  updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create index if not exists user_card_collection_user_id_idx
  on public.user_card_collection (user_id);

alter table public.user_card_collection enable row level security;

create policy "Users can read their collection"
  on public.user_card_collection for select
  using (auth.uid() = user_id);

create policy "Users can add to their collection"
  on public.user_card_collection for insert
  with check (auth.uid() = user_id);

create policy "Users can update their collection"
  on public.user_card_collection for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can remove from their collection"
  on public.user_card_collection for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.user_card_collection to authenticated;
