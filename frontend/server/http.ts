import { randomUUID } from 'node:crypto';
import { GAME_ACTIONS, applyAction, createGame, dropMember, isMember, nextDeadline, tick } from './game.js';
import type { Action, Ctx, Result } from './game.js';
import { redact } from './redact.js';
import type { GameStore, Stored } from './store.js';
import { reaches } from './types.js';
import type { Message } from './types.js';

/**
 * The whole backend, as a fetch handler shared by the Vercel Functions and the dev server:
 *
 *   POST /api/action  { action, sessionId, gameId?, ... } -> { messages, stream? }
 *   GET  /api/events?gameId=&sessionId=&after=            -> text/event-stream
 *
 * An action answers the caller directly; whatever it means for everyone else goes into the
 * game's event log, which each client streams. The streams double as the game clock, running
 * timers as they fall due, and as presence: a member whose stream stays away gets dropped.
 */
export interface Deps {
  store: GameStore;
  clock?: () => number;
  random?: () => number;
  newId?: () => string;
  /** How long one stream lives; Vercel Hobby ends a function at 300s. */
  streamMs?: number;
  /** How often a stream looks for new events. */
  pollMs?: number;
}

export interface ActionResponse {
  messages: Message[];
  /** Where the caller stands in the game the action was about: `after` is null once they are out of it. */
  stream?: { gameId: string; after: number | null };
}

/** A member whose stream has been gone this long has left. */
export const QUIET_MS = 45_000;
const TOUCH_MS = 5_000;
const PING_MS = 15_000;
const SWEEP_MS = 60_000;
const MAX_BODY = 8_000;

const SESSION = /^[A-Za-z0-9-]{8,64}$/;
/** Event numbers are Postgres integers. */
const MAX_SEQ = 2_147_483_647;
const GAME_ID = /^[A-Z0-9]{4,12}$/;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });

const eventIdOf = (gameId: string, seq: number) => `${gameId}:${seq}`;

function context(deps: Deps): Ctx {
  return {
    now: (deps.clock ?? Date.now)(),
    random: deps.random ?? Math.random,
    newId: deps.newId ?? (() => randomUUID().replace(/-/g, '').slice(0, 12)),
  };
}

const lastSweep = new WeakMap<GameStore, number>();
async function maybeSweep(deps: Deps) {
  const now = (deps.clock ?? Date.now)();
  if (now - (lastSweep.get(deps.store) ?? -Infinity) < SWEEP_MS) return;
  lastSweep.set(deps.store, now);
  await deps.store.sweep().catch((error) => console.error('sweep failed', error));
}

interface Applied {
  /** The messages the caller gets straight back, in order. */
  messages: Message[];
  stored: Stored | null;
  result: Result | null;
  seq: number;
}

/**
 * Run a change against the stored game and save it, retrying from a fresh read when another
 * change got there first. Messages meant only for the caller skip the log.
 */
async function change(
  deps: Deps,
  gameId: string,
  caller: string | null,
  run: (stored: Stored, ctx: Ctx) => Result,
): Promise<Applied> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const stored = await deps.store.load(gameId);
    if (!stored) return { messages: [], stored: null, result: null, seq: 0 };
    const result = run(stored, context(deps));

    const direct = (i: number) => {
      const { to } = result.out[i];
      return caller !== null && 'only' in to && to.only.length === 1 && to.only[0] === caller;
    };
    const logged = result.out.filter((_, i) => !direct(i));
    const changed = result.game === null || JSON.stringify(result.game) !== JSON.stringify(stored.game);

    let seq = stored.seq;
    if (changed || logged.length > 0) {
      const saved = await deps.store.save(gameId, stored.version, {
        game: result.game,
        events: logged.map(({ to, message }) => ({ audience: to, message })),
        deadline: result.game ? nextDeadline(result.game, context(deps).now) : null,
        seen: caller ?? undefined,
      });
      if (!saved.ok) continue;
      seq = saved.seq;
    }

    const messages: Message[] = [];
    let next = seq - logged.length;
    result.out.forEach(({ to, message }, i) => {
      if (direct(i)) {
        messages.push(redact(message, caller));
        return;
      }
      next += 1;
      if (caller !== null && reaches(to, caller)) {
        messages.push({ ...redact(message, caller), eventId: eventIdOf(gameId, next) });
      }
    });
    return { messages, stored, result, seq };
  }
  throw new Error(`game ${gameId} kept changing underneath us`);
}

function newGameId() {
  return randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function act(body: Record<string, unknown>, deps: Deps): Promise<ActionResponse> {
  const action = typeof body.action === 'string' ? body.action : '';
  const session = typeof body.sessionId === 'string' ? body.sessionId : '';
  const error = (message: string): ActionResponse => ({ messages: [{ action: 'error', message }] });
  if (!SESSION.test(session)) return error('A session id is required.');

  if (action === 'hello') return { messages: [] };

  if (action === 'listPublicGames') {
    await maybeSweep(deps);
    const games = await deps.store.listPublic(20);
    return { messages: [redact({ action: 'publicGamesList', games }, session)] };
  }

  if (action === 'createGame') {
    await maybeSweep(deps);
    for (let attempt = 0; attempt < 5; attempt++) {
      const ctx = context(deps);
      const result = createGame(newGameId(), session, body, ctx);
      const game = result.game!;
      const created = await deps.store.create({
        game,
        events: [],
        deadline: nextDeadline(game, ctx.now),
        seen: session,
      });
      if (!created.ok) continue;
      return {
        messages: result.out.map(({ message }) => redact(message, session)),
        stream: { gameId: game.gameId, after: created.seq },
      };
    }
    return error('Could not create game.');
  }

  if (!GAME_ACTIONS.has(action)) return error(`Unknown action: ${action}`);

  const gameId = typeof body.gameId === 'string' ? body.gameId.trim().toUpperCase() : '';
  if (!GAME_ID.test(gameId)) return error(`gameId is required for ${action} action.`);

  const applied = await change(deps, gameId, session, (stored, ctx) =>
    applyAction(stored.game, session, body as unknown as Action, ctx),
  );
  if (!applied.stored) {
    return {
      messages: action === 'leaveGame' ? [] : [{ action: 'error', message: 'Game not found.' }],
      stream: { gameId, after: null },
    };
  }
  const game = applied.result!.game;
  return {
    messages: applied.messages,
    stream: { gameId, after: game && isMember(game, session) ? applied.seq : null },
  };
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done);
  });

function stream(url: URL, req: Request, deps: Deps): Response | Promise<Response> {
  const gameId = (url.searchParams.get('gameId') ?? '').trim().toUpperCase();
  const session = url.searchParams.get('sessionId') ?? '';
  const resumeFrom = Number(req.headers.get('last-event-id') ?? url.searchParams.get('after') ?? 0);
  if (!GAME_ID.test(gameId) || !SESSION.test(session) || !Number.isInteger(resumeFrom) || resumeFrom < 0 || resumeFrom > MAX_SEQ) {
    return json({ error: 'bad request' }, 400);
  }
  const { store } = deps;
  const clock = deps.clock ?? Date.now;
  const streamMs = deps.streamMs ?? 270_000;
  const pollMs = deps.pollMs ?? 400;

  return (async () => {
    if (!(await store.touch(gameId, session))) {
      const exists = (await store.load(gameId)) !== null;
      return json({ error: exists ? 'not in this game' : 'no such game' }, exists ? 403 : 404);
    }

    const stop = new AbortController();
    req.signal?.addEventListener('abort', () => stop.abort());
    const encoder = new TextEncoder();

    const body = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (text: string) => {
          if (!stop.signal.aborted) controller.enqueue(encoder.encode(text));
        };
        const started = clock();
        let cursor = resumeFrom;
        let touched = started;
        let pinged = started;
        write('retry: 1000\n\n');
        try {
          while (!stop.signal.aborted && clock() - started < streamMs) {
            const poll = await store.poll(gameId, cursor);
            if (!poll.exists) break;
            for (const event of poll.events) {
              cursor = event.seq;
              if (!reaches(event.audience, session)) continue;
              const message = { ...redact(event.message, session), eventId: eventIdOf(gameId, event.seq) };
              write(`id: ${event.seq}\ndata: ${JSON.stringify(message)}\n\n`);
            }

            // The game's own upkeep; if it keeps losing races, the next poll tries again.
            const upkeep = (run: (stored: Stored, ctx: Ctx) => Result) =>
              change(deps, gameId, null, run).catch((error) => console.error(`upkeep for ${gameId} failed`, error));

            if (poll.deadline !== null && poll.deadline <= clock()) {
              await upkeep((stored, ctx) => tick(stored.game, ctx));
            }

            if (clock() - touched >= TOUCH_MS) {
              touched = clock();
              if (!(await store.touch(gameId, session))) break;
              for (const quiet of await store.quiet(gameId, QUIET_MS)) {
                if (quiet !== session) await upkeep((stored, ctx) => dropMember(stored.game, quiet, ctx));
              }
            }

            if (clock() - pinged >= PING_MS) {
              pinged = clock();
              write(': ping\n\n');
            }
            await sleep(pollMs, stop.signal);
          }
        } catch (error) {
          if (!stop.signal.aborted) console.error(`stream for ${gameId} failed`, error);
        } finally {
          stop.abort();
          try {
            controller.close();
          } catch {
            // The client already went away.
          }
        }
      },
      cancel() {
        stop.abort();
      },
    });

    return new Response(body, {
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache, no-transform',
        'x-accel-buffering': 'no',
      },
    });
  })();
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (url.pathname === '/api/action' && req.method === 'POST') {
      const text = await req.text();
      if (text.length > MAX_BODY) return json({ error: 'too big' }, 413);
      let body: unknown;
      try {
        body = JSON.parse(text);
      } catch {
        return json({ error: 'Invalid JSON format.' }, 400);
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid request' }, 400);
      return json(await act(body as Record<string, unknown>, deps));
    }
    if (url.pathname === '/api/events' && req.method === 'GET') return await stream(url, req, deps);
    return json({ error: 'not found' }, 404);
  } catch (error) {
    console.error('api', error);
    return json({ error: 'server error' }, 500);
  }
}
