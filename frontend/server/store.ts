import { memberSessions } from './game.js';
import type { Audience, Game, Message } from './types.js';

export interface Stored {
  game: Game;
  version: number;
  seq: number;
}

export interface LoggedEvent {
  seq: number;
  audience: Audience;
  message: Message;
}

export interface Poll {
  exists: boolean;
  seq: number;
  /** Epoch ms when the game next needs its timers run. */
  deadline: number | null;
  events: LoggedEvent[];
}

export interface Write {
  /** The game after the change; null deletes it. */
  game: Game | null;
  events: { audience: Audience; message: Message }[];
  deadline: number | null;
  /** A member to mark as just seen. */
  seen?: string;
}

/** Games, the event log each client streams from, and who is still around. */
export interface GameStore {
  load(gameId: string): Promise<Stored | null>;
  /** Insert a new game; ok is false when the id is already taken. */
  create(write: Write & { game: Game }): Promise<{ ok: boolean; seq: number }>;
  /** Apply a write if the game is still at `version`; ok is false when another change got there first. */
  save(gameId: string, version: number, write: Write): Promise<{ ok: boolean; seq: number }>;
  poll(gameId: string, after: number): Promise<Poll>;
  /** Mark a member as seen; false when the session is not in the game. */
  touch(gameId: string, session: string): Promise<boolean>;
  /** Members not seen for `forMs`. */
  quiet(gameId: string, forMs: number): Promise<string[]>;
  listPublic(limit: number): Promise<Game[]>;
  /** Drop abandoned games and events nobody can still need. */
  sweep(): Promise<void>;
}

/** Nobody is still resuming a stream this far back. */
export const EVENT_LIFE_MS = 10 * 60 * 1000;
/** A game nobody has touched for two hours is over, as the old hourly cleanup had it. */
export const GAME_LIFE_MS = 2 * 60 * 60 * 1000;
/** A game whose members have all been gone this long is abandoned. */
export const ABANDONED_MS = 10 * 60 * 1000;
/** Only list public games somebody is actually waiting in. */
export const LISTED_IF_SEEN_MS = 60 * 1000;

interface Row {
  game: Game;
  version: number;
  seq: number;
  deadline: number | null;
  createdAt: number;
  updatedAt: number;
  events: (LoggedEvent & { at: number })[];
  members: Map<string, number>;
}

/** The store the dev server and the tests run on. */
export function memoryStore(clock: () => number = Date.now): GameStore & { rows: Map<string, Row> } {
  const rows = new Map<string, Row>();

  const apply = (row: Row, write: Write & { game: Game }) => {
    const now = clock();
    row.game = structuredClone(write.game);
    row.deadline = write.deadline;
    row.updatedAt = now;
    for (const event of write.events) {
      row.seq += 1;
      row.events.push({ seq: row.seq, audience: event.audience, message: structuredClone(event.message), at: now });
    }
    const sessions = new Set(memberSessions(write.game));
    for (const session of [...row.members.keys()]) if (!sessions.has(session)) row.members.delete(session);
    for (const session of sessions) if (!row.members.has(session)) row.members.set(session, now);
    if (write.seen && sessions.has(write.seen)) row.members.set(write.seen, now);
  };

  return {
    rows,
    async load(gameId) {
      const row = rows.get(gameId);
      return row ? { game: structuredClone(row.game), version: row.version, seq: row.seq } : null;
    },
    async create(write) {
      if (rows.has(write.game.gameId)) return { ok: false, seq: 0 };
      const now = clock();
      const row: Row = {
        game: write.game, version: 1, seq: 0, deadline: null, createdAt: now, updatedAt: now,
        events: [], members: new Map(),
      };
      apply(row, write);
      rows.set(write.game.gameId, row);
      return { ok: true, seq: row.seq };
    },
    async save(gameId, version, write) {
      const row = rows.get(gameId);
      if (!row || row.version !== version) return { ok: false, seq: row?.seq ?? 0 };
      if (write.game === null) {
        rows.delete(gameId);
        return { ok: true, seq: row.seq };
      }
      row.version += 1;
      apply(row, write as Write & { game: Game });
      return { ok: true, seq: row.seq };
    },
    async poll(gameId, after) {
      const row = rows.get(gameId);
      if (!row) return { exists: false, seq: 0, deadline: null, events: [] };
      return {
        exists: true,
        seq: row.seq,
        deadline: row.deadline,
        events: row.events
          .filter((event) => event.seq > after)
          .map(({ at: _at, ...event }) => structuredClone(event)),
      };
    },
    async touch(gameId, session) {
      const row = rows.get(gameId);
      if (!row?.members.has(session)) return false;
      row.members.set(session, clock());
      return true;
    },
    async quiet(gameId, forMs) {
      const row = rows.get(gameId);
      if (!row) return [];
      const cutoff = clock() - forMs;
      return [...row.members].filter(([, seen]) => seen < cutoff).map(([session]) => session);
    },
    async listPublic(limit) {
      const now = clock();
      return [...rows.values()]
        .filter((row) => row.game.isPublic && row.game.gameState === 'WAITING')
        .filter((row) => row.updatedAt > now - GAME_LIFE_MS)
        .filter((row) => [...row.members.values()].some((seen) => seen > now - LISTED_IF_SEEN_MS))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map((row) => structuredClone(row.game));
    },
    async sweep() {
      const now = clock();
      for (const [gameId, row] of rows) {
        const lastSeen = Math.max(0, ...row.members.values());
        const stale = row.updatedAt < now - GAME_LIFE_MS;
        const abandoned = lastSeen < now - ABANDONED_MS && row.updatedAt < now - ABANDONED_MS;
        if (stale || abandoned) {
          rows.delete(gameId);
          continue;
        }
        row.events = row.events.filter((event) => event.at >= now - EVENT_LIFE_MS);
      }
    },
  };
}
