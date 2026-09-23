import { PGlite } from '@electric-sql/pglite';
import { sqlStore } from './sqlStore.js';
import type { Sql } from './sqlStore.js';
import { handle } from './http.js';
import { memoryStore } from './store.js';
import type { GameStore, Write } from './store.js';
import { game, player, T0 } from './testing.js';
import type { Game } from './types.js';

/** Each store plus a way to make things look older than they are. */
interface Harness {
  store: GameStore;
  ageMember(gameId: string, session: string, ms: number): Promise<void>;
  ageGame(gameId: string, ms: number): Promise<void>;
  ageEvents(gameId: string, ms: number): Promise<void>;
}

function memoryHarness(): Harness {
  const now = T0;
  const store = memoryStore(() => now);
  return {
    store,
    async ageMember(gameId, session, ms) {
      store.rows.get(gameId)!.members.set(session, now - ms);
    },
    async ageGame(gameId, ms) {
      const row = store.rows.get(gameId)!;
      row.updatedAt = now - ms;
      row.createdAt = now - ms;
    },
    async ageEvents(gameId, ms) {
      for (const event of store.rows.get(gameId)!.events) event.at = now - ms;
    },
  };
}

let pg: PGlite;
const sql: Sql = async (text, params) => (await pg.query<Record<string, unknown>>(text, params)).rows;

function sqlHarness(): Harness {
  const ago = (ms: number) => `now() - make_interval(secs => ${ms / 1000})`;
  return {
    store: sqlStore(sql),
    async ageMember(gameId, session, ms) {
      await sql(`update game_members set last_seen = ${ago(ms)} where game_id = $1 and session_id = $2`, [gameId, session]);
    },
    async ageGame(gameId, ms) {
      await sql(`update games set updated_at = ${ago(ms)}, created_at = ${ago(ms)} where game_id = $1`, [gameId]);
    },
    async ageEvents(gameId, ms) {
      await sql(`update game_events set created_at = ${ago(ms)} where game_id = $1`, [gameId]);
    },
  };
}

beforeAll(async () => {
  pg = new PGlite();
});

afterAll(async () => {
  await pg.close();
});

const say = (action: string, to: Write['events'][number]['audience'] = { all: true }) => ({
  audience: to,
  message: { action },
});

const write = (g: Game, events: Write['events'] = [], deadline: number | null = null, seen?: string): Write & { game: Game } => ({
  game: g,
  events,
  deadline,
  seen,
});

describe.each([
  ['memory', memoryHarness],
  ['sql', sqlHarness],
])('%s store', (_name, makeHarness) => {
  let h: Harness;
  beforeEach(async () => {
    h = makeHarness();
    if (_name === 'sql') {
      await h.store.load('WARMUP');
      await sql('truncate games cascade');
    }
  });

  test('creates a game once per id', async () => {
    expect(await h.store.create(write(game(), [say('gameCreated')]))).toEqual({ ok: true, seq: 1 });
    expect(await h.store.create(write(game()))).toEqual({ ok: false, seq: 0 });
    expect(await h.store.load('GAME01')).toEqual({ game: game(), version: 1, seq: 1 });
    expect(await h.store.load('NOPE01')).toBeNull();
  });

  test('saves only on top of the version it read', async () => {
    await h.store.create(write(game()));
    const moved = { ...game(), gameState: 'IN_PROGRESS' as const };

    expect(await h.store.save('GAME01', 1, write(moved, [say('gameStarted'), say('statusMessage')]))).toEqual({ ok: true, seq: 2 });
    expect(await h.store.save('GAME01', 1, write(game(), [say('late')]))).toEqual({ ok: false, seq: expect.any(Number) });

    expect(await h.store.load('GAME01')).toEqual({ game: moved, version: 2, seq: 2 });
    expect((await h.store.poll('GAME01', 0)).events.map((e) => [e.seq, e.message.action])).toEqual([
      [1, 'gameStarted'],
      [2, 'statusMessage'],
    ]);
  });

  test('keeps the member list in step with the players and spectators', async () => {
    await h.store.create(write(game()));
    const reshuffled = game({ players: [player('ann'), player('bob')], spectators: [player('dan')] });
    await h.store.save('GAME01', 1, write(reshuffled));

    expect(await h.store.touch('GAME01', 'session-cat')).toBe(false);
    expect(await h.store.touch('GAME01', 'session-dan')).toBe(true);
    expect(await h.store.touch('GAME01', 'session-ann')).toBe(true);
    expect(await h.store.touch('NOPE01', 'session-ann')).toBe(false);
  });

  test('marks the caller as seen, but only while they are a member', async () => {
    await h.store.create(write(game()));
    await h.ageMember('GAME01', 'session-bob', 60_000);
    await h.ageMember('GAME01', 'session-cat', 60_000);

    await h.store.save('GAME01', 1, write(game(), [], null, 'session-bob'));
    expect((await h.store.quiet('GAME01', 30_000)).sort()).toEqual(['session-cat']);

    await h.store.save('GAME01', 2, write(game({ players: [player('ann'), player('bob')] }), [], null, 'session-cat'));
    expect(await h.store.touch('GAME01', 'session-cat')).toBe(false);
  });

  test('reports members who have gone quiet', async () => {
    await h.store.create(write(game()));
    await h.ageMember('GAME01', 'session-bob', 50_000);
    expect(await h.store.quiet('GAME01', 45_000)).toEqual(['session-bob']);
    expect(await h.store.quiet('NOPE01', 45_000)).toEqual([]);
  });

  test('deletes a game along with its events and members', async () => {
    await h.store.create(write(game(), [say('gameCreated')]));
    expect((await h.store.save('GAME01', 1, { game: null, events: [], deadline: null })).ok).toBe(true);
    expect(await h.store.load('GAME01')).toBeNull();
    expect(await h.store.poll('GAME01', 0)).toEqual({ exists: false, seq: 0, deadline: null, events: [] });
    expect((await h.store.save('GAME01', 2, { game: null, events: [], deadline: null })).ok).toBe(false);
  });

  test('polls the events after a cursor, with their audience, and the next deadline', async () => {
    await h.store.create(write(game(), [say('one'), say('two', { only: ['session-bob'] })], T0 + 10_000));
    const poll = await h.store.poll('GAME01', 1);
    expect(poll).toEqual({
      exists: true,
      seq: 2,
      deadline: T0 + 10_000,
      events: [{ seq: 2, audience: { only: ['session-bob'] }, message: { action: 'two' } }],
    });
    expect((await h.store.poll('GAME01', 2)).events).toEqual([]);
  });

  test('lists public games that are waiting for someone who is still around, newest first', async () => {
    await h.store.create(write(game({ gameId: 'OLD001', isPublic: true })));
    await h.ageGame('OLD001', 60_000);
    await h.store.create(write(game({ gameId: 'NEW001', isPublic: true })));
    await h.store.create(write(game({ gameId: 'PRIV01' })));
    await h.store.create(write(game({ gameId: 'BUSY01', isPublic: true, gameState: 'IN_PROGRESS' })));
    await h.store.create(write(game({ gameId: 'GONE01', isPublic: true })));
    for (const p of ['ann', 'bob', 'cat']) await h.ageMember('GONE01', `session-${p}`, 5 * 60_000);

    expect((await h.store.listPublic(20)).map((g) => g.gameId)).toEqual(['NEW001', 'OLD001']);
    expect((await h.store.listPublic(1)).map((g) => g.gameId)).toEqual(['NEW001']);
  });

  test('sweeps stale and abandoned games, and old events', async () => {
    await h.store.create(write(game({ gameId: 'STALE1' })));
    await h.ageGame('STALE1', 3 * 60 * 60_000);
    await h.store.create(write(game({ gameId: 'EMPTY1' })));
    await h.ageGame('EMPTY1', 15 * 60_000);
    for (const p of ['ann', 'bob', 'cat']) await h.ageMember('EMPTY1', `session-${p}`, 15 * 60_000);
    await h.store.create(write(game({ gameId: 'LIVE01' }), [say('old'), say('older')]));
    await h.ageEvents('LIVE01', 11 * 60_000);

    await h.store.sweep();

    expect(await h.store.load('STALE1')).toBeNull();
    expect(await h.store.load('EMPTY1')).toBeNull();
    expect(await h.store.load('LIVE01')).not.toBeNull();
    expect((await h.store.poll('LIVE01', 0)).events).toEqual([]);
  });
});

test('the SQL store retries creating its tables after a failure', async () => {
  let calls = 0;
  const flaky: Sql = async (text, params) => {
    if (++calls === 1) throw new Error('cold start');
    return sql(text, params);
  };
  const store = sqlStore(flaky);
  await expect(store.load('GAME01')).rejects.toThrow('cold start');
  expect(await store.load('GAME01')).toBeNull();
});

test('over SQL, event streams still turn away strangers and missing games', async () => {
  await sql('truncate games cascade');
  const deps = { store: sqlStore(sql) };
  const post = async (body: Record<string, unknown>) =>
    (await handle(new Request('http://test/api/action', { method: 'POST', body: JSON.stringify(body) }), deps)).json();
  const events = (gameId: string, session: string) =>
    handle(new Request(`http://test/api/events?gameId=${gameId}&sessionId=${session}`), deps);

  const { stream } = await post({ action: 'createGame', sessionId: 'session-sql-owner' });
  expect((await events(stream.gameId, 'session-sql-stranger')).status).toBe(403);
  expect((await events('NOPE01', 'session-sql-stranger')).status).toBe(404);
});
