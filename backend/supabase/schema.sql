create table if not exists public.games (
  game_id text primary key,
  data jsonb not null,
  is_public boolean not null default false,
  game_state text not null,
  updated_at timestamptz not null default now(),
  ttl bigint
);

create index if not exists games_public_waiting_idx
  on public.games (is_public, game_state);

create index if not exists games_ttl_idx
  on public.games (ttl);

alter table public.games enable row level security;

drop policy if exists "Service role manages games" on public.games;
create policy "Service role manages games"
  on public.games
  for all
  to service_role
  using (true)
  with check (true);

drop function if exists public.broadcast_game_status();
create function public.broadcast_game_status()
returns trigger
language plpgsql
security definer
set search_path = public, realtime
as $$
begin
  perform realtime.send(
    (new.data - 'secretWord' - 'wordOptions')::jsonb,
    'game_status',
    'game:' || new.game_id,
    false
  );

  return new;
end;
$$;

revoke execute on function public.broadcast_game_status() from public;
revoke execute on function public.broadcast_game_status() from anon;
revoke execute on function public.broadcast_game_status() from authenticated;

drop trigger if exists games_broadcast_status on public.games;
create trigger games_broadcast_status
after insert or update on public.games
for each row
execute function public.broadcast_game_status();
