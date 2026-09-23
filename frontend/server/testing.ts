import type { Ctx } from './game.js';
import type { Game, Outgoing, Player } from './types.js';

export const T0 = Date.parse('2026-09-23T00:00:00.000Z');

/** `random` pinned just under 1 keeps shuffles in order and draws the last item of every pool. */
export function testCtx(now = T0, random: () => number = () => 0.999999): Ctx {
  let next = 0;
  return { now, random, newId: () => `conn-${++next}` };
}

export function player(name: string, overrides: Partial<Player> = {}): Player {
  return {
    connectionId: `c-${name}`,
    sessionId: `session-${name}`,
    name,
    score: 0,
    joinedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

export function game(overrides: Partial<Game> = {}): Game {
  const players = overrides.players ?? [player('ann'), player('bob'), player('cat')];
  return {
    gameId: 'GAME01',
    ownerId: players[0].connectionId,
    ownerSessionId: players[0].sessionId,
    players,
    spectators: [],
    gameState: 'WAITING',
    isPublic: false,
    timeLimit: 60,
    maxRounds: 2,
    createdAt: new Date(T0).toISOString(),
    updatedAt: new Date(T0).toISOString(),
    ...overrides,
  };
}

/** A game mid-turn: `describer` is choosing, or describing `word` since `startedAt`. */
export function inProgress(overrides: Partial<Game> = {}, word?: string, startedAt = T0): Game {
  return game({
    gameState: 'IN_PROGRESS',
    currentRound: 1,
    currentDescriberIndex: 0,
    turnStartTime: new Date(startedAt).toISOString(),
    ...(word
      ? { turnState: 'DESCRIBING', secretWord: word, currentHint: word.replace(/./g, '_ ').trim() }
      : { turnState: 'CHOOSING_WORD', wordOptions: ['apple', 'rocket', 'zebra'] }),
    ...overrides,
  });
}

export const actions = (out: Outgoing[]) => out.map((o) => o.message.action);
export const sent = (out: Outgoing[], action: string) => out.filter((o) => o.message.action === action);
