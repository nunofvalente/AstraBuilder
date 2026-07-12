drop policy if exists "Match participants can read match metadata" on public.game_matches;

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_matches'
  ) then
    alter publication supabase_realtime drop table public.game_matches;
  end if;
end $$;

-- Match state contains both hands and deck order. It is intentionally available
-- only through service-role API routes that return a seat-specific projection.
