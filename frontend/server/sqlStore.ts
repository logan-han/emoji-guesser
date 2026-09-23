import { memberSessions } from './game.js';
import type { Game } from './types.js';
import { ABANDONED_MS, EVENT_LIFE_MS, GAME_LIFE_MS, LISTED_IF_SEEN_MS } from './store.js';
import type { GameStore, LoggedEvent, Write } from './store.js';

/** Runs one parameterised statement: Neon's HTTP driver in production, PGlite in the tests. */
export type Sql = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

export const SCHEMA = [
  `create table if not exists games (
    game_id text primary key,
    data jsonb not null,
    version integer not null default 1,
    seq integer not null default 0,
    is_public boolean not null default false,
    game_state text not null,
    deadline_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`,
  `create index if not exists games_listed on games (created_at) where is_public and game_state = 'WAITING'`,
  `create table if not exists game_events (
    game_id text not null references games (game_id) on delete cascade,
    seq integer not null,
    audience jsonb not null,
    message jsonb not null,
    created_at timestamptz not null default now(),
    primary key (game_id, seq)
  )`,
  `create index if not exists game_events_created on game_events (created_at)`,
  `create table if not exists game_members (
    game_id text not null references games (game_id) on delete cascade,
    session_id text not null,
    last_seen timestamptz not null default now(),
    primary key (game_id, session_id)
  )`,
];

const toTimestamp = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

/** Each write is one statement, so the game, its events and its members change together or not at all. */
export function sqlStore(sql: Sql): GameStore {
  let ready: Promise<void> | null = null;
  // Created on first use by each instance: cheap when the tables are already there.
  const schema = () =>
    (ready ??= (async () => {
      for (const statement of SCHEMA) await sql(statement);
    })().catch((error) => {
      ready = null;
      throw error;
    }));

  const writeParams = (write: Write & { game: Game }) => [
    JSON.stringify(write.game),
    write.events.length,
    write.game.isPublic,
    write.game.gameState,
    toTimestamp(write.deadline),
    JSON.stringify(write.events.map((event) => ({ audience: event.audience, message: event.message }))),
    JSON.stringify(memberSessions(write.game)),
    write.seen ?? null,
  ];

  return {
    async load(gameId) {
      await schema();
      const rows = await sql('select data, version, seq from games where game_id = $1', [gameId]);
      if (rows.length === 0) return null;
      return { game: rows[0].data as Game, version: Number(rows[0].version), seq: Number(rows[0].seq) };
    },

    async create(write) {
      await schema();
      const rows = await sql(
        `with created as (
          insert into games (game_id, data, seq, is_public, game_state, deadline_at)
          values ($1, $2::jsonb, $3, $4, $5, $6::timestamptz)
          on conflict (game_id) do nothing
          returning game_id, seq
        ), logged as (
          insert into game_events (game_id, seq, audience, message)
          select created.game_id, e.ord::int, e.value -> 'audience', e.value -> 'message'
          from created, jsonb_array_elements($7::jsonb) with ordinality as e(value, ord)
          returning 1
        ), joined as (
          insert into game_members (game_id, session_id)
          select created.game_id, s from created, jsonb_array_elements_text($8::jsonb) as s
          on conflict do nothing
          returning 1
        )
        select seq from created`,
        [write.game.gameId, ...writeParams(write).slice(0, 7)],
      );
      return rows.length === 1 ? { ok: true, seq: Number(rows[0].seq) } : { ok: false, seq: 0 };
    },

    async save(gameId, version, write) {
      await schema();
      if (write.game === null) {
        const rows = await sql('delete from games where game_id = $1 and version = $2 returning seq', [gameId, version]);
        return rows.length === 1 ? { ok: true, seq: Number(rows[0].seq) } : { ok: false, seq: 0 };
      }
      const rows = await sql(
        `with changed as (
          update games set data = $3::jsonb, version = version + 1, seq = seq + $4, is_public = $5,
            game_state = $6, deadline_at = $7::timestamptz, updated_at = now()
          where game_id = $1 and version = $2
          returning game_id, seq
        ), logged as (
          insert into game_events (game_id, seq, audience, message)
          select changed.game_id, changed.seq - $4 + e.ord::int, e.value -> 'audience', e.value -> 'message'
          from changed, jsonb_array_elements($8::jsonb) with ordinality as e(value, ord)
          returning 1
        ), members as (
          select jsonb_array_elements_text($9::jsonb) as session_id
        ), gone as (
          delete from game_members m using changed
          where m.game_id = changed.game_id and m.session_id not in (select session_id from members)
          returning 1
        ), joined as (
          insert into game_members (game_id, session_id)
          select changed.game_id, members.session_id from changed, members
          on conflict do nothing
          returning 1
        ), seen as (
          update game_members m set last_seen = now() from changed
          where m.game_id = changed.game_id and m.session_id = $10
            and m.session_id in (select session_id from members)
          returning 1
        )
        select seq from changed`,
        [gameId, version, ...writeParams(write as Write & { game: Game })],
      );
      return rows.length === 1 ? { ok: true, seq: Number(rows[0].seq) } : { ok: false, seq: 0 };
    },

    async poll(gameId, after) {
      await schema();
      const rows = await sql(
        `select g.seq, (extract(epoch from g.deadline_at) * 1000)::float8 as deadline,
          coalesce((
            select jsonb_agg(jsonb_build_object('seq', e.seq, 'audience', e.audience, 'message', e.message) order by e.seq)
            from game_events e where e.game_id = g.game_id and e.seq > $2
          ), '[]'::jsonb) as events
        from games g where g.game_id = $1`,
        [gameId, after],
      );
      if (rows.length === 0) return { exists: false, seq: 0, deadline: null, events: [] };
      const row = rows[0];
      return {
        exists: true,
        seq: Number(row.seq),
        deadline: row.deadline === null ? null : Number(row.deadline),
        events: row.events as LoggedEvent[],
      };
    },

    async touch(gameId, session) {
      await schema();
      const rows = await sql(
        'update game_members set last_seen = now() where game_id = $1 and session_id = $2 returning 1',
        [gameId, session],
      );
      return rows.length === 1;
    },

    async quiet(gameId, forMs) {
      await schema();
      const rows = await sql(
        `select session_id from game_members
        where game_id = $1 and last_seen < now() - make_interval(secs => $2::float8 / 1000)`,
        [gameId, forMs],
      );
      return rows.map((row) => String(row.session_id));
    },

    async listPublic(limit) {
      await schema();
      const rows = await sql(
        `select g.data from games g
        where g.is_public and g.game_state = 'WAITING'
          and g.updated_at > now() - make_interval(secs => $2::float8 / 1000)
          and exists (
            select 1 from game_members m
            where m.game_id = g.game_id and m.last_seen > now() - make_interval(secs => $3::float8 / 1000)
          )
        order by g.created_at desc limit $1`,
        [limit, GAME_LIFE_MS, LISTED_IF_SEEN_MS],
      );
      return rows.map((row) => row.data as Game);
    },

    async sweep() {
      await schema();
      await sql(
        `delete from games g
        where g.updated_at < now() - make_interval(secs => $1::float8 / 1000)
          or (g.updated_at < now() - make_interval(secs => $2::float8 / 1000)
            and not exists (
              select 1 from game_members m
              where m.game_id = g.game_id and m.last_seen > now() - make_interval(secs => $2::float8 / 1000)
            ))`,
        [GAME_LIFE_MS, ABANDONED_MS],
      );
      await sql('delete from game_events where created_at < now() - make_interval(secs => $1::float8 / 1000)', [
        EVENT_LIFE_MS,
      ]);
    },
  };
}
