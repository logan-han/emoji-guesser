const API = import.meta.env.VITE_API_URL || '/api';
/** A stream that lasted this long ended on the server's schedule, not because something is wrong. */
const STREAM_SETTLED_MS = 5_000;

interface StreamPointer {
  gameId: string;
  after: number | null;
}

interface ActionResponse {
  messages: Record<string, unknown>[];
  stream?: StreamPointer;
}

const wait = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener('abort', done);
  });

/**
 * The game API behind a WebSocket's shape, so App keeps driving one socket: `send` posts an
 * action, and both its answer and the game's event stream arrive through `onmessage`.
 */
export class GameSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = GameSocket.CONNECTING;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  private following: { gameId: string; stop: AbortController } | null = null;
  private cursor = 0;
  /** Sent again if the server has dropped us from the game and we need to rejoin it. */
  private playerName: string | undefined;

  constructor(
    private readonly sessionId: string,
    private readonly base = API,
  ) {
    this.post({ action: 'hello' }).then(
      () => {
        if (this.readyState !== GameSocket.CONNECTING) return;
        this.readyState = GameSocket.OPEN;
        this.onopen?.(new Event('open'));
      },
      () => this.fail(),
    );
  }

  send(data: string) {
    if (this.readyState !== GameSocket.OPEN) return;
    const message = JSON.parse(data) as Record<string, unknown>;
    const name = message.playerName ?? message.name;
    if (typeof name === 'string' && name) this.playerName = name;
    // Stop listening straight away, so nothing from the old game lands after the player left it.
    if (message.action === 'leaveGame') this.unfollow();
    this.post(message).catch(() => this.fail());
  }

  close() {
    this.readyState = GameSocket.CLOSED;
    this.unfollow();
  }

  private async post(message: Record<string, unknown>) {
    const response = await fetch(`${this.base}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId, ...message }),
    });
    if (!response.ok) throw new Error(`action failed with ${response.status}`);
    const body = (await response.json()) as ActionResponse;
    if (this.readyState === GameSocket.CLOSED) return;
    for (const reply of body.messages) this.deliver(JSON.stringify(reply));
    if (body.stream) this.point(body.stream);
  }

  private deliver(data: string) {
    this.onmessage?.(new MessageEvent('message', { data }));
  }

  /** Follow the game an answer says we are in, or stop following one we are out of. */
  private point({ gameId, after }: StreamPointer) {
    if (after === null) {
      if (this.following?.gameId === gameId) this.unfollow();
      return;
    }
    if (this.following?.gameId === gameId) return;
    this.unfollow();
    this.cursor = after;
    const stop = new AbortController();
    this.following = { gameId, stop };
    void this.follow(gameId, stop.signal);
  }

  private unfollow() {
    this.following?.stop.abort();
    this.following = null;
  }

  private async follow(gameId: string, signal: AbortSignal) {
    let failures = 0;
    while (!signal.aborted) {
      const opened = Date.now();
      try {
        const query = `gameId=${encodeURIComponent(gameId)}&sessionId=${encodeURIComponent(this.sessionId)}&after=${this.cursor}`;
        const response = await fetch(`${this.base}/events?${query}`, { headers: { accept: 'text/event-stream' }, signal });
        if (response.status === 404) return this.unfollow();
        if (response.status === 403) {
          // Dropped after going quiet for too long: join again, and follow whatever that answers.
          this.unfollow();
          this.post({ action: 'joinGame', gameId, playerName: this.playerName }).catch(() => this.fail());
          return;
        }
        if (!response.ok || !response.body) throw new Error(`stream failed with ${response.status}`);
        await this.read(response.body, signal);
        // A stream that ran its course hit the server's time limit: pick straight back up, with no
        // timer, since a long-hidden tab only gets to run timers once a minute.
        if (Date.now() - opened >= STREAM_SETTLED_MS) {
          failures = 0;
          continue;
        }
      } catch {
        if (signal.aborted) return;
      }
      // Failed, or ended as soon as it opened: back off rather than hammer the server.
      if (++failures >= 5) return this.fail();
      await wait(Math.min(1000 * 2 ** (failures - 1), 15_000), signal);
    }
  }

  private async read(body: ReadableStream<Uint8Array>, signal: AbortSignal) {
    const reader = body.getReader();
    const cancel = () => void reader.cancel().catch(() => {});
    signal.addEventListener('abort', cancel);
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        buffer += decoder.decode(value, { stream: true });
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          this.frame(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
        }
      }
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  private frame(frame: string) {
    const data: string[] = [];
    for (const line of frame.split('\n')) {
      if (line.startsWith('id: ')) this.cursor = Number(line.slice(4)) || this.cursor;
      else if (line.startsWith('data: ')) data.push(line.slice(6));
    }
    if (data.length > 0) this.deliver(data.join('\n'));
  }

  private fail() {
    if (this.readyState === GameSocket.CLOSED) return;
    this.readyState = GameSocket.CLOSED;
    this.unfollow();
    this.onerror?.(new Event('error'));
    this.onclose?.(new CloseEvent('close'));
  }
}
