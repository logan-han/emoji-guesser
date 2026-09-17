import {
  GAMES_TABLE,
  countRealtime,
  eventWith,
  mocks,
  player,
  recipientsOf,
  resetMocks,
  routeDb,
  sentTo,
} from './testUtils';
import { default_handler, disconnect } from './websockets';

vi.mock('./dictionary', async () => (await import('./testUtils')).dictionaryMock());
vi.mock('./supabaseStore', async () => (await import('./testUtils')).supabaseStoreMock());
vi.mock('@aws-sdk/client-apigatewaymanagementapi', async () => (await import('./testUtils')).apiGatewayMock());

vi.useFakeTimers();

const activeGame = (overrides: Record<string, unknown> = {}) => ({
  gameId: 'DC1',
  gameState: 'IN_PROGRESS',
  ownerId: 'conn-1',
  ownerSessionId: 'session-conn-1',
  players: [player('conn-1'), player('conn-2'), player('conn-3')],
  spectators: [player('spec-1')],
  currentDescriberIndex: 0,
  currentRound: 1,
  maxRounds: 3,
  timeLimit: 30,
  turnState: 'DESCRIBING',
  turnStartTime: new Date().toISOString(),
  wordOptions: ['apple', 'banana', 'orange'],
  ...overrides,
});

/** Serves one game to both the direct reads and the disconnect scan. */
const serveToScanAndGet = (game: any) => routeDb({
  get: () => ({ Item: structuredClone(game) }),
  scan: () => ({ Items: [structuredClone(game)] }),
});

const leave = (connectionId: string) =>
  disconnect(eventWith({}, connectionId), {} as any, {} as any);

const armRoundTimer = (gameId: string, connectionId: string) =>
  default_handler(eventWith({ action: 'chooseWord', gameId, word: 'apple' }, connectionId), {} as any, {} as any);

describe('Disconnecting out of an active game', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('ends the game and drops the pending round timer when one player is left', async () => {
    const game = activeGame({ gameId: 'DC-END', players: [player('conn-1'), player('conn-2')] });
    serveToScanAndGet(game);

    await armRoundTimer('DC-END', 'conn-1');
    await leave('conn-2');

    expect(recipientsOf('gameEnded')).toEqual(['conn-1', 'spec-1']);
    expect(sentTo('conn-1')).toContainEqual(expect.objectContaining({
      action: 'gameEnded',
      message: 'Game ended - Player conn-2 left and there are not enough players to continue.',
    }));

    // The armed timer was cleared, so the round never force-ends behind the game.
    await vi.advanceTimersByTimeAsync(31_000);
    expect(countRealtime('timeUp')).toBe(0);
  });

  test('hands the turn on and drops the timer when the describer leaves', async () => {
    const game = activeGame({ gameId: 'DC-DESCRIBER', currentDescriberIndex: 2 });
    serveToScanAndGet(game);

    await armRoundTimer('DC-DESCRIBER', 'conn-3');
    await leave('conn-3');

    expect(recipientsOf('nextTurn')).toEqual(['conn-1', 'conn-2', 'spec-1']);
    expect(recipientsOf('playerLeft')).toEqual(['conn-1', 'conn-2', 'spec-1']);
    expect(sentTo('conn-1')).toContainEqual(expect.objectContaining({
      action: 'playerLeft',
      message: 'Player conn-3 (describer) left the game. Moving to next turn.',
    }));

    await vi.advanceTimersByTimeAsync(31_000);
    expect(countRealtime('timeUp')).toBe(0);
  });

  test('wraps the describer index back to the first player', async () => {
    const game = activeGame({ gameId: 'DC-WRAP', currentDescriberIndex: 2 });
    serveToScanAndGet(game);

    await leave('conn-3');

    // nextTurn advances from the wrapped index 0, so conn-2 describes next.
    expect(sentTo('conn-2')).toContainEqual(expect.objectContaining({ action: 'chooseWord' }));
  });

  test('reassigns ownership and shifts the describer index when the owner leaves', async () => {
    const game = activeGame({ gameId: 'DC-OWNER', currentDescriberIndex: 1 });
    serveToScanAndGet(game);

    await leave('conn-1');

    expect(mocks.updateCommand).toHaveBeenCalledWith({
      TableName: GAMES_TABLE,
      Key: { gameId: 'DC-OWNER' },
      UpdateExpression: 'set players = :p, ownerId = :o, currentDescriberIndex = :d, maxRounds = :m',
      ExpressionAttributeValues: {
        ':p': expect.arrayContaining([expect.objectContaining({ connectionId: 'conn-2' })]),
        ':o': 'conn-2',
        ':d': 0,
        ':m': 2,
      },
    });
    expect(recipientsOf('playerLeft')).toEqual(['conn-2', 'conn-3', 'spec-1']);
  });
});

describe('Stale player cleanup', () => {
  const stale = () => new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const start = (gameId: string) => default_handler(
    eventWith({ action: 'startGame', gameId, sessionId: 'session-conn-1' }),
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('deletes a game whose players have all gone quiet', async () => {
    const game = activeGame({
      gameId: 'DC-STALE',
      gameState: 'STARTING',
      players: [player('conn-1', { lastSeen: stale() }), player('conn-2', { lastSeen: stale() })],
    });
    routeDb({ update: () => ({ Attributes: structuredClone(game) }) });

    await start('DC-STALE');

    expect(mocks.deleteCommand).toHaveBeenCalledWith({
      TableName: GAMES_TABLE,
      Key: { gameId: 'DC-STALE' },
    });
    expect(sentTo('conn-1')).toContainEqual({
      action: 'error',
      message: 'Game has been removed due to inactivity.',
    });
  });

  test('ignores a start request for a game that is no longer waiting', async () => {
    routeDb({ update: () => ({}) });

    await start('DC-NOT-WAITING');

    expect(sentTo('conn-1')).toEqual([]);
    expect(mocks.putCommand).not.toHaveBeenCalled();
  });

  test('drops a player who has never been seen at all', async () => {
    const game = activeGame({
      gameId: 'DC-NEVER-SEEN',
      gameState: 'STARTING',
      players: [player('conn-1'), player('conn-2', { lastSeen: undefined })],
    });
    routeDb({ update: () => ({ Attributes: structuredClone(game) }) });

    await start('DC-NEVER-SEEN');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':o': 'conn-1' }),
    }));
    expect(recipientsOf('playerLeft')).toEqual(['conn-1']);
  });

  test('keeps the owner in place when only the other players went quiet', async () => {
    const game = activeGame({
      gameId: 'DC-OWNER-STAYS',
      gameState: 'STARTING',
      players: [player('conn-1'), player('conn-2', { lastSeen: stale() })],
    });
    routeDb({ update: () => ({ Attributes: structuredClone(game) }) });

    await start('DC-OWNER-STAYS');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':o': 'conn-1', ':os': 'session-conn-1' }),
    }));
  });
});

describe('Disconnecting out of a game that has not started', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('leaves the owner in place when someone else drops out of the lobby', async () => {
    serveToScanAndGet(activeGame({ gameId: 'DC-LOBBY', gameState: 'WAITING' }));

    await leave('conn-2');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':o': 'conn-1' }),
    }));
    expect(recipientsOf('playerLeft')).toEqual(['conn-1', 'conn-3']);
  });

  test('hands the lobby to the next player when the owner drops out', async () => {
    serveToScanAndGet(activeGame({ gameId: 'DC-LOBBY-OWNER', gameState: 'WAITING' }));

    await leave('conn-1');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':o': 'conn-2' }),
    }));
  });

  test('walks past games the disconnecting player was never in', async () => {
    const other = activeGame({ gameId: 'DC-OTHER', players: [player('conn-7')] });
    routeDb({ scan: () => ({ Items: [structuredClone(other)] }) });

    await leave('conn-1');

    expect(mocks.updateCommand).not.toHaveBeenCalled();
    expect(mocks.deleteCommand).not.toHaveBeenCalled();
  });
});

describe('Describer bookkeeping when a guesser leaves', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  // The describer-left branch returns earlier, so the index-equals and
  // index-out-of-range arms below it are unreachable.
  test('leaves the index alone for a game that has no describer yet', async () => {
    const game = activeGame({ gameId: 'DC-NO-DESCRIBER', currentDescriberIndex: undefined });
    serveToScanAndGet(game);

    await leave('conn-2');

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':d': undefined }),
    }));
  });
});
