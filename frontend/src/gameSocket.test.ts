import type { GameSocket as GameSocketType } from './gameSocket';

const { GameSocket } = await vi.importActual<typeof import('./gameSocket')>('./gameSocket');

interface Call {
  url: string;
  body?: Record<string, unknown>;
  signal?: AbortSignal;
}

/** An event stream the test writes into. */
function sse() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => void (controller = c) });
  const encoder = new TextEncoder();
  return {
    response: new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }),
    push: (text: string) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
  };
}

let calls: Call[];
let replies: ((call: Call) => Response | Promise<Response>)[];
let streams: ((call: Call) => Response | Promise<Response>)[];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.useFakeTimers();
  calls = [];
  replies = [];
  streams = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call: Call = { url, signal: init.signal ?? undefined, ...(init.body ? { body: JSON.parse(String(init.body)) } : {}) };
      calls.push(call);
      const next = (url.includes('/events?') ? streams : replies).shift();
      if (!next) return json({ messages: [] });
      return next(call);
    }),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const flush = () => vi.advanceTimersByTimeAsync(0);

async function connected(): Promise<{ socket: GameSocketType; received: Record<string, unknown>[]; closed: string[] }> {
  const socket = new GameSocket('session-1234', '/api');
  const received: Record<string, unknown>[] = [];
  const closed: string[] = [];
  socket.onmessage = (event) => received.push(JSON.parse(event.data));
  socket.onerror = () => closed.push('error');
  socket.onclose = () => closed.push('close');
  const opened = new Promise<void>((resolve) => (socket.onopen = () => resolve()));
  await flush();
  await opened;
  return { socket, received, closed };
}

const streamCalls = () => calls.filter((call) => call.url.includes('/events?'));

describe('opening', () => {
  test('says hello, then opens', async () => {
    const { socket } = await connected();
    expect(socket.readyState).toBe(GameSocket.OPEN);
    expect(calls[0]).toMatchObject({ url: '/api/action', body: { action: 'hello', sessionId: 'session-1234' } });
  });

  test('closes when the server cannot be reached', async () => {
    replies.push(() => Promise.reject(new TypeError('offline')));
    const socket = new GameSocket('session-1234', '/api');
    const events: string[] = [];
    socket.onopen = () => events.push('open');
    socket.onerror = () => events.push('error');
    socket.onclose = () => events.push('close');
    await flush();
    expect(events).toEqual(['error', 'close']);
    expect(socket.readyState).toBe(GameSocket.CLOSED);
  });

  test('stays closed if closed before the hello comes back', async () => {
    const socket = new GameSocket('session-1234');
    const opened = vi.fn();
    socket.onopen = opened;
    socket.close();
    await flush();
    expect(opened).not.toHaveBeenCalled();
    expect(calls[0].url).toBe('/api/action');
  });
});

describe('actions', () => {
  test('post with the session and hand back the answers in order', async () => {
    const { socket, received } = await connected();
    replies.push(() => json({ messages: [{ action: 'one' }, { action: 'two' }] }));

    socket.send(JSON.stringify({ action: 'listPublicGames' }));
    await flush();

    expect(calls[1].body).toEqual({ action: 'listPublicGames', sessionId: 'session-1234' });
    expect(received).toEqual([{ action: 'one' }, { action: 'two' }]);
  });

  test('are dropped until the socket is open', async () => {
    const socket = new GameSocket('session-1234');
    socket.send(JSON.stringify({ action: 'createGame' }));
    await flush();
    expect(calls.map((call) => call.body?.action)).toEqual(['hello']);
  });

  test('a failed action closes the socket so the app reconnects', async () => {
    const { socket, closed } = await connected();
    replies.push(() => json({ error: 'server error' }, 500));
    socket.send(JSON.stringify({ action: 'startGame', gameId: 'GAME01' }));
    await flush();
    expect(closed).toEqual(['error', 'close']);
    expect(socket.readyState).toBe(GameSocket.CLOSED);
  });

  test('answers that land after close are dropped', async () => {
    const { socket, received } = await connected();
    let answer!: (response: Response) => void;
    replies.push(() => new Promise<Response>((resolve) => (answer = resolve)));
    socket.send(JSON.stringify({ action: 'listPublicGames' }));
    await flush();
    socket.close();
    answer(json({ messages: [{ action: 'late' }] }));
    await flush();
    expect(received).toEqual([]);
  });
});

describe('following a game', () => {
  const join = async (socket: GameSocketType, reply: unknown) => {
    replies.push(() => json(reply));
    socket.send(JSON.stringify({ action: 'joinGame', gameId: 'GAME01', playerName: 'Ann' }));
    await flush();
  };

  test('streams the game from where the answer left off, tracking the event ids', async () => {
    const { socket, received } = await connected();
    const events = sse();
    streams.push(() => events.response);
    await join(socket, { messages: [{ action: 'playerJoined' }], stream: { gameId: 'GAME01', after: 4 } });

    expect(streamCalls()[0].url).toBe('/api/events?gameId=GAME01&sessionId=session-1234&after=4');
    events.push('retry: 1000\n\nid: 5\ndata: {"action":"newEmoji",');
    events.push('"emoji":"🐶"}\n\n: ping\n\n');
    events.push('id: 6\ndata: {"action":"a"}\ndata: \n\n');
    await flush();

    expect(received.map((m) => m.action)).toEqual(['playerJoined', 'newEmoji', 'a']);
    expect(received[1]).toEqual({ action: 'newEmoji', emoji: '🐶' });

    // The server ends each stream before its time limit; the next one resumes straight away,
    // after the last id, without waiting on a timer.
    await vi.advanceTimersByTimeAsync(270_000);
    events.end();
    await flush();
    expect(streamCalls()[1].url).toContain('after=6');
  });

  test('backs off from a stream that ends as soon as it opens', async () => {
    const { socket } = await connected();
    const events = sse();
    streams.push(() => events.response);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });
    events.end();
    await flush();
    expect(streamCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(streamCalls()).toHaveLength(2);
  });

  test('keeps one stream per game, and switches when the answer points at another', async () => {
    const { socket } = await connected();
    streams.push(() => sse().response, () => sse().response);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 9 } });
    expect(streamCalls()).toHaveLength(1);

    await join(socket, { messages: [], stream: { gameId: 'GAME02', after: 0 } });
    expect(streamCalls()).toHaveLength(2);
    expect(streamCalls()[0].signal!.aborted).toBe(true);
    expect(streamCalls()[1].url).toContain('gameId=GAME02');
  });

  test('stops when the answer says the player is out of the game', async () => {
    const { socket } = await connected();
    streams.push(() => sse().response);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });
    await join(socket, { messages: [], stream: { gameId: 'OTHER1', after: null } });
    expect(streamCalls()[0].signal!.aborted).toBe(false);

    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: null } });
    expect(streamCalls()[0].signal!.aborted).toBe(true);
  });

  test('stops the moment the player leaves, before the server answers', async () => {
    const { socket, received } = await connected();
    const events = sse();
    streams.push(() => events.response);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });

    replies.push(() => new Promise(() => {}));
    socket.send(JSON.stringify({ action: 'leaveGame', gameId: 'GAME01' }));
    expect(streamCalls()[0].signal!.aborted).toBe(true);
    await flush();
    expect(received).toEqual([]);
  });

  test('stops for good once the game is gone', async () => {
    const { socket } = await connected();
    streams.push(() => json({ error: 'no such game' }, 404));
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(streamCalls()).toHaveLength(1);
  });

  test('rejoins under the same name after being dropped for going quiet', async () => {
    const { socket, received } = await connected();
    streams.push(() => json({ error: 'not in this game' }, 403), () => sse().response);
    replies.push(() => json({ messages: [], stream: { gameId: 'GAME01', after: 1 } }));
    replies.push(() => json({ messages: [{ action: 'spectatorJoined' }], stream: { gameId: 'GAME01', after: 7 } }));
    socket.send(JSON.stringify({ action: 'joinGame', gameId: 'GAME01', playerName: 'Ann' }));
    await flush();

    expect(calls.find((call) => call.body?.action === 'joinGame' && call !== calls[1])?.body).toEqual({
      action: 'joinGame',
      gameId: 'GAME01',
      playerName: 'Ann',
      sessionId: 'session-1234',
    });
    expect(received).toEqual([{ action: 'spectatorJoined' }]);
    expect(streamCalls()[1].url).toContain('after=7');
  });

  test('backs off through network errors, then gives up and closes', async () => {
    const { socket, closed } = await connected();
    const offline = () => Promise.reject(new TypeError('offline'));
    streams.push(offline, offline, () => json({}, 502), offline, offline);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });

    await vi.advanceTimersByTimeAsync(1000);
    expect(streamCalls()).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(streamCalls()).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(4000 + 8000);
    expect(streamCalls()).toHaveLength(5);
    expect(closed).toEqual(['error', 'close']);
  });

  test('close stops the stream without reporting a close', async () => {
    const { socket, closed, received } = await connected();
    const events = sse();
    streams.push(() => events.response);
    await join(socket, { messages: [], stream: { gameId: 'GAME01', after: 1 } });
    socket.close();
    await flush();
    expect(streamCalls()[0].signal!.aborted).toBe(true);
    expect(closed).toEqual([]);
    expect(received).toEqual([]);
  });
});
