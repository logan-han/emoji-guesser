import {
  countRealtime,
  eventWith,
  mocks,
  player,
  recipientsOf,
  resetMocks,
  routeDb,
  sentTo,
  serveGame,
} from './testUtils';
import { default_handler } from './websockets';

vi.mock('./dictionary', async () => (await import('./testUtils')).dictionaryMock());
vi.mock('./supabaseStore', async () => (await import('./testUtils')).supabaseStoreMock());
vi.mock('@aws-sdk/client-apigatewaymanagementapi', async () => (await import('./testUtils')).apiGatewayMock());

vi.useFakeTimers();

const GAME_ID = 'BC1';
const PLAYERS = ['conn-1', 'conn-2'];
const SPECTATORS = ['spec-1', 'spec-2'];

const watchedGame = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_ID,
  gameState: 'IN_PROGRESS',
  ownerId: 'conn-1',
  ownerSessionId: 'session-conn-1',
  players: PLAYERS.map(id => player(id)),
  spectators: SPECTATORS.map(id => player(id)),
  currentDescriberIndex: 0,
  currentRound: 1,
  maxRounds: 2,
  timeLimit: 120,
  turnState: 'DESCRIBING',
  turnStartTime: new Date(Date.now() - 115_000).toISOString(),
  secretWord: 'apple',
  currentHint: 'a _ _ _ _',
  wordOptions: ['apple', 'banana', 'orange'],
  ...overrides,
});

const send = (body: Record<string, unknown>, connectionId = 'conn-1') =>
  default_handler(eventWith({ gameId: GAME_ID, ...body }, connectionId), {} as any, {} as any);

describe('Spectators receive the same broadcasts as players', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('a chosen word starts the turn for guessers and spectators alike', async () => {
    serveGame(watchedGame({ turnState: 'CHOOSING_WORD' }));

    await send({ action: 'chooseWord', word: 'apple' });

    expect(recipientsOf('turnStarted')).toEqual(['conn-2', ...SPECTATORS]);
    expect(recipientsOf('describeWord')).toEqual(['conn-1']);
  });

  test('a wrong guess reaches every player and spectator', async () => {
    serveGame(watchedGame());

    await send({ action: 'submitGuess', guess: 'banana' }, 'conn-2');

    expect(recipientsOf('newGuess')).toEqual([...PLAYERS, ...SPECTATORS]);
    expect(sentTo('spec-1')).toContainEqual(expect.objectContaining({
      action: 'newGuess',
      text: 'Player conn-2: banana',
    }));
  });

  test('a correct guess on the final round ends the game for everyone', async () => {
    serveGame(watchedGame({ currentRound: 2, maxRounds: 2 }));

    await send({ action: 'submitGuess', guess: 'Apple ' }, 'conn-2');

    expect(recipientsOf('wordGuessed')).toEqual([...PLAYERS, ...SPECTATORS]);
    expect(recipientsOf('gameEnded')).toEqual([...PLAYERS, ...SPECTATORS]);
    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      UpdateExpression: 'set gameState = :s REMOVE turnState, turnStartTime, secretWord, currentHint, wordOptions',
    }));
  });

  test('a correct guess mid-game rolls the round over to the next one', async () => {
    serveGame(watchedGame({ currentRound: 1, maxRounds: 3, currentDescriberIndex: 1 }));

    await send({ action: 'submitGuess', guess: 'apple' }, 'conn-1');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':d': 0, ':r': 2 }),
    }));
  });

  test('emoji reach the spectators watching the round', async () => {
    serveGame(watchedGame());

    await send({ action: 'submitEmoji', emoji: '🍎' });

    expect(recipientsOf('newEmoji')).toEqual([...PLAYERS, ...SPECTATORS]);
  });

  test('a timed-out round is announced to the spectators', async () => {
    serveGame(watchedGame({ timeLimit: 30, turnStartTime: new Date(Date.now() - 40_000).toISOString() }));

    await send({ action: 'timeUp' });

    expect(recipientsOf('timeUp')).toEqual([...PLAYERS, ...SPECTATORS]);
  });

  test('refreshed hints go to the spectators but not the describer', async () => {
    mocks.generateHint.mockReturnValue('a p _ _ _');
    serveGame(watchedGame({ timeLimit: 300, turnStartTime: new Date(Date.now() - 30_000).toISOString() }));

    await send({ action: 'updateHint' });

    expect(recipientsOf('hintUpdated')).toEqual(['conn-2', ...SPECTATORS]);
  });
});

describe('Actions against a game that is gone', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
    routeDb({ get: () => ({}) });
  });

  test.each([
    ['chooseWord', { action: 'chooseWord', word: 'apple' }],
    ['submitGuess', { action: 'submitGuess', guess: 'apple' }],
    ['clearEmojis', { action: 'clearEmojis' }],
    ['submitEmoji', { action: 'submitEmoji', emoji: '🍎' }],
    ['updateHint', { action: 'updateHint' }],
  ])('%s stays quiet', async (_action, body) => {
    await send(body);

    expect(mocks.postToConnectionCommand).not.toHaveBeenCalled();
    expect(mocks.publishGameEvent).not.toHaveBeenCalled();
  });
});

describe('Failures while talking to clients', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('a read failure is logged once per action rather than thrown', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    routeDb({ get: () => { throw new Error('read failed'); } });

    await send({ action: 'submitGuess', guess: 'apple' }, 'conn-2');
    await send({ action: 'clearEmojis' });
    await send({ action: 'timeUp' });
    await send({ action: 'updateHint' });

    const logged = errorSpy.mock.calls.map(([message]) => String(message));
    expect(logged).toEqual([
      `Failed to submit guess for game ${GAME_ID}:`,
      `Failed to clear emojis for game ${GAME_ID}:`,
      `Failed to handle time up for game ${GAME_ID}:`,
      `Failed to update hint for game ${GAME_ID}:`,
    ]);
  });

  test('a websocket send that is not a stale connection is logged', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.apgSend.mockRejectedValue({ statusCode: 500 });
    serveGame(watchedGame());

    await send({ action: 'submitEmoji', emoji: '🍎' });

    expect(errorSpy).toHaveBeenCalledWith('Failed to send message to conn-1:', { statusCode: 500 });
  });

  test('a realtime publish failure does not stop the direct sends', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.publishGameEvent.mockRejectedValue(new Error('realtime down'));
    serveGame(watchedGame());

    await send({ action: 'submitEmoji', emoji: '🍎' });

    expect(errorSpy).toHaveBeenCalledWith(`Realtime publish failed for ${GAME_ID}:`, expect.any(Error));
    expect(recipientsOf('newEmoji')).toEqual([...PLAYERS, ...SPECTATORS]);
    expect(countRealtime('newEmoji')).toBe(1);
  });
});

describe('Round end guards', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('a timeUp that arrives well before the limit is ignored', async () => {
    serveGame(watchedGame({ timeLimit: 300, turnStartTime: new Date(Date.now() - 5_000).toISOString() }));

    await send({ action: 'timeUp' });

    expect(recipientsOf('timeUp')).toEqual([]);
    expect(mocks.updateCommand).not.toHaveBeenCalled();
  });
});

describe('Restart settings', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('the owner can change the round time while restarting', async () => {
    serveGame(watchedGame({ gameState: 'ENDED', spectators: [] }));

    await send({ action: 'restartGame', sessionId: 'session-conn-1', timeLimit: 240 });

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':tl': 240 }),
    }));
  });
});

describe('Games stored without a spectator list', () => {
  // Records written before spectators existed have no `spectators` key at all.
  const unwatchedGame = (overrides: Record<string, unknown> = {}) => {
    const { spectators, ...game } = watchedGame(overrides);
    return game;
  };

  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('ends the game for the players it does have', async () => {
    serveGame(unwatchedGame({ currentRound: 2 }));

    await send({ action: 'submitGuess', guess: 'apple' }, 'conn-2');

    expect(recipientsOf('gameEnded')).toEqual(PLAYERS);
  });

  test('fans an emoji out to the players it does have', async () => {
    serveGame(unwatchedGame());

    await send({ action: 'submitEmoji', emoji: '🍎' });

    expect(recipientsOf('newEmoji')).toEqual(PLAYERS);
  });

  test('clears the board for the players it does have', async () => {
    serveGame(unwatchedGame());

    await send({ action: 'clearEmojis' });

    expect(recipientsOf('emojisCleared')).toEqual(PLAYERS);
  });

  test('refreshes the hint on a heartbeat for the players it does have', async () => {
    mocks.generateHint.mockReturnValue('a p _ _ _');
    serveGame(unwatchedGame());

    await send({ action: 'heartbeat' }, 'conn-2');

    expect(recipientsOf('hintUpdated')).toEqual(['conn-2']);
  });

  test('pushes a requested hint update to the players it does have', async () => {
    mocks.generateHint.mockReturnValue('a p _ _ _');
    serveGame(unwatchedGame());

    await send({ action: 'updateHint' });

    expect(recipientsOf('hintUpdated')).toEqual(['conn-2']);
  });
});
