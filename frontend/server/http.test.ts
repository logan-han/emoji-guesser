import { WORD_CHOICE_MS } from './game.js';
import { QUIET_MS, handle } from './http.js';
import type { ActionResponse, Deps } from './http.js';
import { memoryStore } from './store.js';
import type { GameStore } from './store.js';
import { T0 } from './testing.js';
import type { Message } from './types.js';

const ANN = 'session-ann-0001';
const BOB = 'session-bob-0002';
const CAT = 'session-cat-0003';

let now: number;
let store: ReturnType<typeof memoryStore>;
let deps: Deps;
const streams: Stream[] = [];

beforeEach(() => {
  now = T0;
  store = memoryStore(() => now);
  let ids = 0;
  deps = { store, clock: () => now, random: () => 0.999999, newId: () => `pub-${++ids}`, pollMs: 2, streamMs: 60_000 };
});

afterEach(() => {
  for (const stream of streams.splice(0)) stream.close();
});

async function post(body: unknown, init: RequestInit = {}) {
  const res = await handle(
    new Request('http://test/api/action', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body), ...init }),
    deps,
  );
  return { status: res.status, body: (await res.json()) as ActionResponse & { error?: string } };
}

const act = async (body: Record<string, unknown>) => (await post(body)).body;

interface Stream {
  status: number;
  messages: (Message & { id?: number })[];
  comments: string[];
  ended: Promise<void>;
  close(): void;
  next(match: (message: Message) => boolean, what?: string): Promise<Message & { id?: number }>;
}

async function open(gameId: string, session: string, query = '', headers: Record<string, string> = {}): Promise<Stream> {
  const abort = new AbortController();
  const res = await handle(
    new Request(`http://test/api/events?gameId=${gameId}&sessionId=${session}${query}`, { headers, signal: abort.signal }),
    deps,
  );
  const messages: Stream['messages'] = [];
  const comments: string[] = [];
  let ended: Promise<void> = Promise.resolve();
  if (res.status === 200 && res.body) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    ended = (async () => {
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read().catch(() => ({ done: true, value: undefined }));
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let split: number;
        while ((split = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, split);
          buffer = buffer.slice(split + 2);
          let id: number | undefined;
          for (const line of frame.split('\n')) {
            if (line.startsWith(':')) comments.push(line);
            else if (line.startsWith('id: ')) id = Number(line.slice(4));
            else if (line.startsWith('data: ')) messages.push({ ...JSON.parse(line.slice(6)), id });
          }
        }
      }
    })();
  }
  const stream: Stream = {
    status: res.status,
    messages,
    comments,
    ended,
    close: () => abort.abort(),
    async next(match, what = 'a message') {
      for (let waited = 0; waited < 3000; waited += 5) {
        const found = messages.find(match);
        if (found) return found;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      throw new Error(`timed out waiting for ${what}; got ${JSON.stringify(messages.map((m) => m.action))}`);
    },
  };
  streams.push(stream);
  return stream;
}

const action = (name: string) => (message: Message) => message.action === name;
const settle = () => new Promise((resolve) => setTimeout(resolve, 30));

async function newGame(extra: Record<string, unknown> = {}) {
  const created = await act({ action: 'createGame', sessionId: ANN, playerName: 'Ann', ...extra });
  return created.stream!.gameId;
}

describe('actions', () => {
  test('hello just answers', async () => {
    expect(await post({ action: 'hello', sessionId: ANN })).toEqual({ status: 200, body: { messages: [] } });
  });

  test('refuses requests without a usable session, or that are not JSON objects', async () => {
    expect((await act({ action: 'hello' })).messages).toEqual([{ action: 'error', message: 'A session id is required.' }]);
    expect(await post('{nope')).toEqual({ status: 400, body: { error: 'Invalid JSON format.' } });
    expect((await post('[1]')).status).toBe(400);
    expect((await post('null')).status).toBe(400);
    expect((await post('x'.repeat(9000))).status).toBe(413);
  });

  test('names an unknown action, and asks for a game id where one is needed', async () => {
    expect((await act({ action: 'dance', sessionId: ANN })).messages[0].message).toBe('Unknown action: dance');
    expect((await act({ action: 'startGame', sessionId: ANN })).messages[0].message).toBe(
      'gameId is required for startGame action.',
    );
  });

  test('only knows its two routes', async () => {
    expect((await handle(new Request('http://test/api/other'), deps)).status).toBe(404);
    expect((await handle(new Request('http://test/api/action'), deps)).status).toBe(404);
  });

  test('creating a game answers the creator and points them at its stream', async () => {
    const created = await act({ action: 'createGame', sessionId: ANN, playerName: 'Ann', isPublic: true });
    expect(created.stream).toEqual({ gameId: expect.stringMatching(/^[0-9A-F]{6}$/), after: 0 });
    const [message] = created.messages;
    expect(message.action).toBe('gameCreated');
    expect(message.game).toMatchObject({
      gameId: created.stream!.gameId,
      ownerSessionId: ANN,
      players: [{ name: 'Ann', sessionId: ANN, connectionId: 'pub-1' }],
    });
  });

  test('retries a clashing game id', async () => {
    let calls = 0;
    const clashing: GameStore = { ...store, create: async (w) => (++calls === 1 ? { ok: false, seq: 0 } : store.create(w)) };
    deps.store = clashing;
    expect((await act({ action: 'createGame', sessionId: ANN })).messages[0].action).toBe('gameCreated');
    expect(calls).toBe(2);

    deps.store = { ...store, create: async () => ({ ok: false, seq: 0 }) };
    expect((await act({ action: 'createGame', sessionId: ANN })).messages).toEqual([
      { action: 'error', message: 'Could not create game.' },
    ]);
  });

  test('joining lists the newcomer for the others without their session id', async () => {
    const gameId = await newGame();
    const annStream = await open(gameId, ANN);

    const joined = await act({ action: 'joinGame', sessionId: BOB, gameId: gameId.toLowerCase(), playerName: 'Bob' });
    expect(joined.messages.map((m) => m.action)).toEqual(['playerJoined']);
    expect(joined.stream).toEqual({ gameId, after: 1 });
    expect((joined.messages[0].game as { players: { sessionId?: string }[] }).players.map((p) => p.sessionId)).toEqual([
      undefined,
      BOB,
    ]);

    const seen = await annStream.next(action('playerJoined'));
    expect(seen.eventId).toBe(`${gameId}:1`);
    expect(seen.id).toBe(1);
    expect((seen.game as { players: { sessionId?: string }[] }).players.map((p) => p.sessionId)).toEqual([ANN, undefined]);
  });

  test('an unknown game is an error, and leaves the caller out of it', async () => {
    expect(await act({ action: 'joinGame', sessionId: BOB, gameId: 'NOPE01' })).toEqual({
      messages: [{ action: 'error', message: 'Game not found.' }],
      stream: { gameId: 'NOPE01', after: null },
    });
    expect(await act({ action: 'leaveGame', sessionId: BOB, gameId: 'NOPE01' })).toEqual({
      messages: [],
      stream: { gameId: 'NOPE01', after: null },
    });
  });

  test('leaving takes the caller out and tells the rest', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId, playerName: 'Bob' });
    const annStream = await open(gameId, ANN, '&after=1');

    expect(await act({ action: 'leaveGame', sessionId: BOB, gameId })).toEqual({ messages: [], stream: { gameId, after: null } });
    await annStream.next(action('playerLeft'));
  });

  test('the last player leaving deletes the game', async () => {
    const gameId = await newGame();
    await act({ action: 'leaveGame', sessionId: ANN, gameId });
    expect(await store.load(gameId)).toBeNull();
  });

  test('an action that changes nothing writes nothing', async () => {
    const gameId = await newGame();
    const before = await store.load(gameId);
    expect((await act({ action: 'submitGuess', sessionId: ANN, gameId, guess: 'x' })).messages).toEqual([]);
    expect(await store.load(gameId)).toEqual(before);
  });

  test('errors go only to the caller and skip the log', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    const refused = await act({ action: 'startGame', sessionId: BOB, gameId });
    expect(refused.messages).toEqual([{ action: 'error', message: 'Only the owner can start the game.' }]);
    expect((await store.poll(gameId, 0)).seq).toBe(1);
  });

  test('starting hands the owner their share in order, with log ids on what everyone saw', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId, playerName: 'Bob' });
    const bobStream = await open(gameId, BOB, '&after=1');

    const started = await act({ action: 'startGame', sessionId: ANN, gameId });
    // The random source keeps Ann first, so she describes and gets the word options directly.
    expect(started.messages.map((m) => [m.action, m.eventId])).toEqual([
      ['gameStarted', `${gameId}:2`],
      ['chooseWord', undefined],
      ['statusMessage', `${gameId}:3`],
    ]);
    expect(started.stream).toEqual({ gameId, after: 3 });

    await bobStream.next(action('statusMessage'));
    expect(bobStream.messages.map((m) => m.action)).toEqual(['gameStarted', 'statusMessage']);
    expect((bobStream.messages[0].game as Record<string, unknown>).wordOptions).toBeUndefined();
  });

  test('retries when another change lands between the read and the write', async () => {
    const gameId = await newGame();
    let clashes = 1;
    deps.store = {
      ...store,
      save: async (...args) => (clashes-- > 0 ? { ok: false, seq: 0 } : store.save(...args)),
    };
    expect((await act({ action: 'joinGame', sessionId: BOB, gameId })).messages[0].action).toBe('playerJoined');

    deps.store = { ...store, save: async () => ({ ok: false, seq: 0 }) };
    const stuck = await post({ action: 'joinGame', sessionId: CAT, gameId });
    expect(stuck).toEqual({ status: 500, body: { error: 'server error' } });
  });

  test('lists the public games people are waiting in', async () => {
    const open1 = await newGame({ isPublic: true });
    await newGame();
    const listed = await act({ action: 'listPublicGames', sessionId: BOB });
    expect(listed.messages).toHaveLength(1);
    expect(listed.messages[0]).toMatchObject({ action: 'publicGamesList', games: [{ gameId: open1 }] });
    expect(JSON.stringify(listed.messages)).not.toContain(ANN);
  });

  test('sweeps at most once a minute, and survives a failed sweep', async () => {
    let sweeps = 0;
    deps.store = { ...store, sweep: async () => void sweeps++ };
    await act({ action: 'listPublicGames', sessionId: BOB });
    await act({ action: 'listPublicGames', sessionId: BOB });
    expect(sweeps).toBe(1);

    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.store = { ...store, sweep: async () => Promise.reject(new Error('down')) };
    expect((await act({ action: 'listPublicGames', sessionId: BOB })).messages[0].action).toBe('publicGamesList');
    expect(errors).toHaveBeenCalledWith('sweep failed', expect.any(Error));
    errors.mockRestore();
  });
});

describe('event streams', () => {
  test('refuse bad requests, strangers and missing games', async () => {
    const gameId = await newGame();
    expect((await open('bad id', ANN)).status).toBe(400);
    expect((await open(gameId, 'x')).status).toBe(400);
    expect((await open(gameId, ANN, '&after=-1')).status).toBe(400);
    expect((await open(gameId, ANN, '&after=2147483648')).status).toBe(400);
    expect((await open(gameId, BOB)).status).toBe(403);
    expect((await open('NOPE01', BOB)).status).toBe(404);
  });

  test('resume after the last event id the client saw', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    await act({ action: 'joinGame', sessionId: CAT, gameId });
    const resumed = await open(gameId, ANN, '&after=0', { 'last-event-id': '1' });
    await resumed.next(action('playerJoined'));
    await settle();
    expect(resumed.messages.map((m) => m.id)).toEqual([2]);
  });

  test('only carry what is meant for the listener', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    await act({ action: 'startGame', sessionId: ANN, gameId });
    const bobStream = await open(gameId, BOB);
    const annStream = await open(gameId, ANN);

    // Ann let the word timer run out: the server picks for her.
    now += WORD_CHOICE_MS;
    const describe = await annStream.next(action('describeWord'));
    expect(describe.word).toEqual(expect.any(String));
    const started = await bobStream.next(action('turnStarted'));
    expect(started.hint).toMatch(/^_( _)*$/);
    expect(bobStream.messages.find(action('describeWord'))).toBeUndefined();
    expect(JSON.stringify(bobStream.messages)).not.toContain(`"word":"${describe.word}"`);
  });

  test('run the round clock through to time up', async () => {
    const gameId = await newGame({ timeLimit: 30 });
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    await act({ action: 'startGame', sessionId: ANN, gameId });
    await act({ action: 'chooseWord', sessionId: ANN, gameId, word: (await store.load(gameId))!.game.wordOptions![0] });
    const bobStream = await open(gameId, BOB);

    now += 15_000;
    await bobStream.next(action('hintUpdated'), 'a hint');
    now += 15_000;
    const up = await bobStream.next(action('timeUp'), 'time up');
    expect(up.word).toEqual(expect.any(String));
    await bobStream.next(action('nextTurn'), 'the next turn');
  });

  test('drop a member whose stream has gone quiet', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId, playerName: 'Bob' });
    const annStream = await open(gameId, ANN);
    await settle();

    // Ann keeps streaming; Bob never opened one.
    for (let t = 0; t <= QUIET_MS; t += 5_000) {
      now += 5_000;
      await settle();
    }
    const left = await annStream.next(action('playerLeft'), 'Bob to be dropped');
    expect((left.game as { players: unknown[] }).players).toHaveLength(1);
  });

  test('stop once the listener is no longer in the game, or the game is gone', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    const bobStream = await open(gameId, BOB);
    await act({ action: 'leaveGame', sessionId: BOB, gameId });
    now += 5_000;
    await bobStream.ended;

    const annStream = await open(gameId, ANN);
    await act({ action: 'leaveGame', sessionId: ANN, gameId });
    await annStream.ended;
  });

  test('end on their own before the platform cuts them off, pinging along the way', async () => {
    const gameId = await newGame();
    const annStream = await open(gameId, ANN);
    now += 16_000;
    await settle();
    now += 60_000;
    await annStream.ended;
    expect(annStream.comments).toContain(': ping');
  });

  test('log and end when the store fails mid-stream', async () => {
    const gameId = await newGame();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let polls = 0;
    deps.store = {
      ...store,
      poll: async (...args) => (++polls > 1 ? Promise.reject(new Error('neon down')) : store.poll(...args)),
    };
    const annStream = await open(gameId, ANN);
    await annStream.ended;
    expect(errors).toHaveBeenCalledWith(`stream for ${gameId} failed`, expect.any(Error));
    errors.mockRestore();
  });

  test('keep going when the round clock keeps losing races', async () => {
    const gameId = await newGame();
    await act({ action: 'joinGame', sessionId: BOB, gameId });
    await act({ action: 'startGame', sessionId: ANN, gameId });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    deps.store = { ...store, save: async () => ({ ok: false, seq: 0 }) };
    const annStream = await open(gameId, ANN);

    now += WORD_CHOICE_MS;
    await vi.waitFor(() => expect(errors).toHaveBeenCalledWith(`upkeep for ${gameId} failed`, expect.any(Error)));
    deps.store = store;
    await annStream.next(action('describeWord'), 'the clock to recover');
    errors.mockRestore();
  });

  test('stop quietly when the listener hangs up', async () => {
    const gameId = await newGame();
    const annStream = await open(gameId, ANN);
    await settle();
    annStream.close();
    await annStream.ended;
  });
});
