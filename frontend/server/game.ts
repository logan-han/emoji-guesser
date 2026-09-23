import { everyone, except, only } from './types.js';
import type { Audience, Game, Message, Outgoing, Player } from './types.js';
import { generateHint, nextHintAt, pickWords } from './words.js';

/** How long a describer has to pick a word before the first option is picked for them. */
export const WORD_CHOICE_MS = 10_000;

export interface Ctx {
  now: number;
  random: () => number;
  /** A fresh public player id. */
  newId: () => string;
}

export interface Result {
  /** The game after the change, or null when it should be deleted. */
  game: Game | null;
  out: Outgoing[];
}

// Repeat until stable so nested markup such as `<<b>b>` cannot survive a single pass
export function stripTags(value: string): string {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current;
}

export function sanitizeName(name: unknown): string {
  return typeof name === 'string' ? stripTags(name).trim().slice(0, 20) : '';
}

function sanitizeGuess(guess: unknown): string {
  return typeof guess === 'string' ? stripTags(guess).trim().slice(0, 50) : '';
}

/** Emoji arrive one at a time from a picker; a ZWJ family is the longest at about a dozen code units. */
function sanitizeEmoji(emoji: unknown): string {
  if (typeof emoji !== 'string') return '';
  const trimmed = emoji.trim();
  return trimmed.length > 0 && trimmed.length <= 32 && !/[<>]/.test(trimmed) ? trimmed : '';
}

function wholeNumberIn(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
}

export const validTimeLimit = (value: unknown) => wholeNumberIn(value, 30, 600);
export const validMaxRounds = (value: unknown) => wholeNumberIn(value, 1, 10);

const ADJECTIVES = ['Sunny', 'Lucky', 'Pixel', 'Cosmic', 'Jolly', 'Neon', 'Clever', 'Zesty'];
const NOUNS = ['Mango', 'Panda', 'Rocket', 'Waffle', 'Noodle', 'Comet', 'Puzzle', 'Sprout'];

export function randomName(random: () => number): string {
  const adjective = ADJECTIVES[Math.floor(random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(random() * NOUNS.length)];
  return `${adjective} ${noun} ${Math.floor(10 + random() * 90)}`;
}

export const describerOf = (game: Game): Player | undefined =>
  game.currentDescriberIndex === undefined ? undefined : game.players[game.currentDescriberIndex];

export const memberSessions = (game: Game): string[] =>
  [...game.players, ...game.spectators].map((member) => member.sessionId);

export const isMember = (game: Game, session: string) => memberSessions(game).includes(session);

/** When the game next needs a timer to fire, as epoch ms. */
export function nextDeadline(game: Game, now: number): number | null {
  if (game.gameState !== 'IN_PROGRESS' || !game.turnStartTime) return null;
  const start = Date.parse(game.turnStartTime);
  if (game.turnState === 'CHOOSING_WORD') return start + WORD_CHOICE_MS;
  if (game.turnState === 'DESCRIBING') {
    const roundEnd = start + game.timeLimit * 1000;
    const hintAt = game.secretWord ? nextHintAt(game.secretWord, now - start, game.timeLimit * 1000) : null;
    return hintAt === null ? roundEnd : Math.min(roundEnd, start + hintAt);
  }
  return null;
}

/** A change in progress: a private copy of the game plus the messages it produces. */
class Change {
  readonly game: Game;
  readonly out: Outgoing[] = [];
  deleted = false;
  private readonly before: string;

  constructor(
    game: Game,
    readonly ctx: Ctx,
  ) {
    this.before = JSON.stringify(game);
    this.game = structuredClone(game);
  }

  get nowIso() {
    return new Date(this.ctx.now).toISOString();
  }

  send(to: Audience, message: Message) {
    this.out.push({ to, message: { ...message } });
  }

  /** Messages carry a snapshot of the game as it was when they were sent. */
  sendGame(to: Audience, action: string, extra: Record<string, unknown> = {}) {
    this.send(to, { action, game: structuredClone(this.game), ...extra });
  }

  error(session: string, message: string) {
    this.send(only(session), { action: 'error', message });
  }

  /** Only a real change moves `updatedAt`, so a no-op leaves the stored game alone. */
  result(): Result {
    if (this.deleted) return { game: null, out: this.out };
    if (JSON.stringify(this.game) !== this.before) this.game.updatedAt = this.nowIso;
    return { game: this.game, out: this.out };
  }
}

function reassignOwner(game: Game) {
  if (game.players.some((player) => player.sessionId === game.ownerSessionId)) return;
  const next = game.players[0];
  if (!next) return;
  game.ownerId = next.connectionId;
  game.ownerSessionId = next.sessionId;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Hand the turn to `currentDescriberIndex` and ask them to pick a word. */
function beginTurn(change: Change, announce: 'gameStarted' | 'nextTurn') {
  const { game } = change;
  game.turnState = 'CHOOSING_WORD';
  game.turnStartTime = change.nowIso;
  game.wordOptions = pickWords(change.ctx.random);
  delete game.secretWord;
  delete game.currentHint;

  const describer = describerOf(game)!;
  change.sendGame(everyone, announce);
  change.send(only(describer.sessionId), { action: 'chooseWord', wordOptions: game.wordOptions });
  change.send(everyone, {
    action: 'statusMessage',
    message: `${describer.name} is choosing a word...`,
    timestamp: change.ctx.now,
  });
}

function endGame(change: Change, message?: string) {
  const { game } = change;
  game.gameState = 'ENDED';
  game.endedAt = change.nowIso;
  delete game.turnState;
  delete game.turnStartTime;
  delete game.secretWord;
  delete game.currentHint;
  delete game.wordOptions;
  delete game.currentDescriberIndex;
  change.sendGame(everyone, 'gameEnded', message ? { message } : {});
}

/** Move to the describer at `index`, wrapping into the next round, or end after the last round. */
function turnTo(change: Change, index: number) {
  const { game } = change;
  if (index < game.players.length) {
    game.currentDescriberIndex = index;
  } else if ((game.currentRound ?? 1) >= game.maxRounds) {
    endGame(change);
    return;
  } else {
    game.currentDescriberIndex = 0;
    game.currentRound = (game.currentRound ?? 1) + 1;
  }
  beginTurn(change, 'nextTurn');
}

function nextTurn(change: Change) {
  turnTo(change, (change.game.currentDescriberIndex ?? -1) + 1);
}

function startDescribing(change: Change, word: string) {
  const { game } = change;
  const describer = describerOf(game)!;
  game.secretWord = word.trim();
  game.turnState = 'DESCRIBING';
  game.turnStartTime = change.nowIso;
  game.currentHint = generateHint(game.secretWord, 0, game.timeLimit * 1000);
  delete game.wordOptions;

  change.sendGame(only(describer.sessionId), 'describeWord', { word: game.secretWord });
  change.sendGame(except(describer.sessionId), 'turnStarted', { hint: game.currentHint });
}

/** Fire whatever timers are due: the word pick, hint reveals and the end of the round. */
function runTimers(change: Change) {
  const { game } = change;
  if (game.gameState !== 'IN_PROGRESS' || !game.turnStartTime) return;
  const elapsed = change.ctx.now - Date.parse(game.turnStartTime);

  if (game.turnState === 'CHOOSING_WORD') {
    if (elapsed >= WORD_CHOICE_MS) {
      startDescribing(change, game.wordOptions?.[0] ?? pickWords(change.ctx.random)[0]);
    }
    return;
  }

  if (game.turnState !== 'DESCRIBING' || !game.secretWord) return;
  if (elapsed >= game.timeLimit * 1000) {
    change.send(everyone, { action: 'timeUp', message: "⏰ Time's up! Moving to next turn...", word: game.secretWord });
    nextTurn(change);
    return;
  }

  const hint = generateHint(game.secretWord, elapsed, game.timeLimit * 1000);
  if (hint !== game.currentHint) {
    game.currentHint = hint;
    change.send(everyone, { action: 'hintUpdated', hint });
  }
}

/** Take a player or spectator out of the game, keeping the turn order and ownership sound. */
function removeMember(change: Change, session: string) {
  const { game } = change;

  const spectatorIndex = game.spectators.findIndex((member) => member.sessionId === session);
  if (spectatorIndex >= 0) {
    game.spectators.splice(spectatorIndex, 1);
    change.sendGame(everyone, 'gameUpdated');
    return;
  }

  const index = game.players.findIndex((player) => player.sessionId === session);
  if (index < 0) return;
  const leaver = game.players[index];
  const remaining = game.players.filter((_, i) => i !== index);
  if (remaining.length === 0) {
    change.deleted = true;
    return;
  }

  const describerIndex = game.currentDescriberIndex;
  game.players = remaining;
  reassignOwner(game);

  if (game.gameState !== 'IN_PROGRESS') {
    change.sendGame(except(session), 'playerLeft');
    return;
  }

  if (remaining.length === 1) {
    endGame(change, `Game ended - ${leaver.name} left and there are not enough players to continue.`);
    return;
  }

  if (describerIndex === index) {
    // The next player in order now sits where the describer did.
    turnTo(change, index);
    change.sendGame(except(session), 'playerLeft', {
      message: `${leaver.name} (describer) left the game. Moving to next turn.`,
    });
    return;
  }

  if (describerIndex !== undefined && index < describerIndex) {
    game.currentDescriberIndex = describerIndex - 1;
  }
  change.sendGame(except(session), 'playerLeft', { message: `${leaver.name} left the game.` });
}

function newMember(change: Change, session: string, name: unknown, isSpectator: boolean): Player {
  return {
    connectionId: change.ctx.newId(),
    sessionId: session,
    name: sanitizeName(name) || randomName(change.ctx.random),
    score: 0,
    joinedAt: change.nowIso,
    ...(isSpectator ? { isSpectator: true } : {}),
  };
}

export interface CreateInput {
  playerName?: unknown;
  timeLimit?: unknown;
  maxRounds?: unknown;
  isPublic?: unknown;
}

export function createGame(gameId: string, session: string, input: CreateInput, ctx: Ctx): Result {
  const now = new Date(ctx.now).toISOString();
  const draft: Game = {
    gameId,
    ownerId: '',
    ownerSessionId: session,
    players: [],
    spectators: [],
    gameState: 'WAITING',
    isPublic: input.isPublic === true,
    timeLimit: validTimeLimit(input.timeLimit) ?? 120,
    maxRounds: validMaxRounds(input.maxRounds) ?? 2,
    createdAt: now,
    updatedAt: now,
  };
  const change = new Change(draft, ctx);
  const owner = newMember(change, session, input.playerName, false);
  change.game.players.push(owner);
  change.game.ownerId = owner.connectionId;
  change.sendGame(only(session), 'gameCreated');
  return change.result();
}

/** Everything a player can ask for once they are in (or trying to get into) a game. */
export type Action =
  | { action: 'joinGame'; playerName?: unknown }
  | { action: 'startGame'; timeLimit?: unknown; maxRounds?: unknown }
  | { action: 'chooseWord'; word?: unknown }
  | { action: 'submitGuess'; guess?: unknown }
  | { action: 'submitEmoji'; emoji?: unknown }
  | { action: 'clearEmojis' }
  | { action: 'updatePlayerName'; name?: unknown }
  | { action: 'restartGame'; timeLimit?: unknown }
  | { action: 'leaveGame' }
  | { action: 'timeUp' | 'updateHint' | 'heartbeat' };

export const GAME_ACTIONS = new Set<string>([
  'joinGame', 'startGame', 'chooseWord', 'submitGuess', 'submitEmoji', 'clearEmojis',
  'updatePlayerName', 'restartGame', 'leaveGame', 'timeUp', 'updateHint', 'heartbeat',
]);

export function applyAction(game: Game, session: string, action: Action, ctx: Ctx): Result {
  const change = new Change(game, ctx);
  // A late guess must not beat the clock, so bring the timers up to date first.
  runTimers(change);
  handle(change, session, action);
  return change.result();
}

function handle(change: Change, session: string, request: Action) {
  const { game } = change;
  const describer = describerOf(game);
  const isDescriber = describer?.sessionId === session;
  const describing = game.gameState === 'IN_PROGRESS' && game.turnState === 'DESCRIBING' && !!game.secretWord;

  switch (request.action) {
    case 'joinGame':
      return join(change, session, request.playerName);

    case 'startGame': {
      if (game.gameState !== 'WAITING') return;
      if (game.ownerSessionId !== session) return change.error(session, 'Only the owner can start the game.');
      if (game.players.length < 2) return change.error(session, 'You need at least 2 ready players to start.');
      game.players = shuffle(game.players, change.ctx.random);
      game.gameState = 'IN_PROGRESS';
      game.currentRound = 1;
      game.currentDescriberIndex = 0;
      game.timeLimit = validTimeLimit(request.timeLimit) ?? game.timeLimit;
      game.maxRounds = validMaxRounds(request.maxRounds) ?? game.maxRounds;
      delete game.endedAt;
      return beginTurn(change, 'gameStarted');
    }

    case 'chooseWord': {
      if (game.gameState !== 'IN_PROGRESS' || !isDescriber) {
        return change.error(session, 'You are not the current describer.');
      }
      const word = typeof request.word === 'string' ? request.word : '';
      if (game.turnState !== 'CHOOSING_WORD' || !game.wordOptions?.includes(word)) {
        return change.error(session, 'Invalid word choice.');
      }
      return startDescribing(change, word);
    }

    case 'submitGuess': {
      const guesser = game.players.find((player) => player.sessionId === session);
      const guess = sanitizeGuess(request.guess);
      if (!describing || !guesser || isDescriber || !guess) return;
      if (guess.toLowerCase() !== game.secretWord!.toLowerCase().trim()) {
        return change.send(everyone, {
          action: 'newGuess',
          text: `${guesser.name}: ${guess}`,
          guesserId: guesser.connectionId,
        });
      }
      const elapsedSeconds = Math.floor((change.ctx.now - Date.parse(game.turnStartTime!)) / 1000);
      guesser.score += 100 + Math.max(0, 50 - elapsedSeconds);
      describer!.score += 75;
      change.sendGame(everyone, 'wordGuessed', { guesserName: guesser.name, word: game.secretWord });
      return nextTurn(change);
    }

    case 'submitEmoji': {
      const emoji = sanitizeEmoji(request.emoji);
      if (!describing || !isDescriber || !emoji) return;
      return change.send(everyone, { action: 'newEmoji', emoji });
    }

    case 'clearEmojis':
      if (!describing || !isDescriber) return;
      return change.send(everyone, { action: 'emojisCleared' });

    case 'updatePlayerName': {
      const name = sanitizeName(request.name);
      if (!name) return change.error(session, 'Player name is required.');
      const player = game.players.find((member) => member.sessionId === session);
      if (!player) return change.error(session, 'Player not found in game.');
      player.name = name;
      return change.sendGame(everyone, 'playerNameUpdated');
    }

    case 'restartGame':
      return restart(change, session, request.timeLimit);

    case 'leaveGame':
      return removeMember(change, session);

    case 'heartbeat':
      return change.send(only(session), {
        action: 'heartbeatAck',
        ...(describing && !isDescriber && isMember(game, session) ? { currentHint: game.currentHint } : {}),
      });

    // Timers run on the server now; a client saying so only hurries them along.
    case 'timeUp':
    case 'updateHint':
      return;
  }
}

function join(change: Change, session: string, playerName: unknown) {
  const { game } = change;
  const name = sanitizeName(playerName);

  const player = game.players.find((member) => member.sessionId === session);
  if (player) {
    if (name) player.name = name;
    change.sendGame(only(session), 'playerJoined');
    if (game.gameState === 'IN_PROGRESS') {
      if (describerOf(game)?.sessionId === session) {
        if (game.turnState === 'CHOOSING_WORD' && game.wordOptions) {
          change.send(only(session), { action: 'chooseWord', wordOptions: game.wordOptions });
        } else if (game.turnState === 'DESCRIBING' && game.secretWord) {
          change.sendGame(only(session), 'describeWord', { word: game.secretWord });
        }
      } else if (game.turnState === 'DESCRIBING' && game.currentHint) {
        change.send(only(session), { action: 'hintUpdated', hint: game.currentHint });
      }
    }
    change.sendGame(except(session), 'playerReconnected');
    return;
  }

  const spectator = game.spectators.find((member) => member.sessionId === session);
  if (spectator) {
    if (name) spectator.name = name;
    change.sendGame(only(session), 'spectatorJoined');
    return;
  }

  if (game.gameState !== 'WAITING') {
    game.spectators.push(newMember(change, session, playerName, true));
    change.sendGame(only(session), 'spectatorJoined');
    change.sendGame(except(session), 'playerJoined');
    return;
  }

  game.players.push(newMember(change, session, playerName, false));
  change.sendGame(only(session), 'playerJoined');
  change.sendGame(except(session), 'playerJoined');
}

function restart(change: Change, session: string, timeLimit: unknown) {
  const { game } = change;

  if (game.ownerSessionId !== session) {
    if (game.gameState !== 'ENDED') return change.error(session, 'Only the owner can restart the game.');
    const player = game.players.find((member) => member.sessionId === session);
    if (!player) return change.error(session, 'You were not in this game.');

    player.wantsToPlayAgain = true;
    const ownerStillIn = game.players.some(
      (member) => member.sessionId === game.ownerSessionId && member.wantsToPlayAgain !== false,
    );
    if (!ownerStillIn) {
      game.ownerId = player.connectionId;
      game.ownerSessionId = session;
      player.isOwner = true;
    }
    const isNewOwner = game.ownerSessionId === session;
    change.sendGame(only(session), 'gameRestarted', {
      isNewOwner,
      message: isNewOwner ? 'You are now the game owner!' : 'You have rejoined the game!',
    });
    const others = game.players
      .filter((member) => member.sessionId !== session && member.wantsToPlayAgain !== false)
      .map((member) => member.sessionId);
    if (others.length > 0) change.sendGame(only(...others), 'playerRejoined', { rejoinedPlayer: player.name });
    return;
  }

  if (game.gameState !== 'ENDED') return change.error(session, 'Can only restart ended games.');

  game.gameState = 'WAITING';
  delete game.currentRound;
  delete game.currentDescriberIndex;
  delete game.turnState;
  delete game.turnStartTime;
  delete game.endedAt;
  delete game.secretWord;
  delete game.wordOptions;
  delete game.currentHint;
  game.players.push(...game.spectators.map(({ isSpectator: _spectator, ...member }) => ({ ...member, score: 0 })));
  game.spectators = [];
  for (const player of game.players) {
    player.score = 0;
    player.wantsToPlayAgain = true;
    player.isOwner = player.sessionId === session;
  }
  game.timeLimit = validTimeLimit(timeLimit) ?? game.timeLimit;
  change.sendGame(everyone, 'gameRestarted');
}

/** Fire due timers; the stream loop calls this whenever a deadline passes. */
export function tick(game: Game, ctx: Ctx): Result {
  const change = new Change(game, ctx);
  runTimers(change);
  return change.result();
}

/** A member whose connection went quiet, or who left on purpose. */
export function dropMember(game: Game, session: string, ctx: Ctx): Result {
  const change = new Change(game, ctx);
  removeMember(change, session);
  return change.result();
}
