import {
  countRealtime,
  eventWith,
  mocks,
  player,
  resetMocks,
  routeDb,
  sentTo,
  serveGame,
  updateExpressions,
} from './testUtils';
import { default_handler } from './websockets';

vi.mock('./dictionary', async () => (await import('./testUtils')).dictionaryMock());
vi.mock('./supabaseStore', async () => (await import('./testUtils')).supabaseStoreMock());
vi.mock('@aws-sdk/client-apigatewaymanagementapi', async () => (await import('./testUtils')).apiGatewayMock());

vi.useFakeTimers();

const TIME_LIMIT = 30;

// Built once per test: the served turnStartTime has to stay put while the fake
// clock moves, or nothing ever looks overdue.
const describingGame = (gameId: string, overrides: Record<string, unknown> = {}) => ({
  gameId,
  gameState: 'IN_PROGRESS',
  ownerId: 'conn-1',
  ownerSessionId: 'session-conn-1',
  players: [player('conn-1'), player('conn-2')],
  currentDescriberIndex: 0,
  currentRound: 1,
  maxRounds: 2,
  timeLimit: TIME_LIMIT,
  turnState: 'DESCRIBING',
  turnStartTime: new Date().toISOString(),
  wordOptions: ['apple', 'banana', 'orange'],
  ...overrides,
});

const pickWord = (gameId: string, word = 'apple', connectionId = 'conn-1') =>
  default_handler(eventWith({ action: 'chooseWord', gameId, word }, connectionId), {} as any, {} as any);

describe('Server-side round timers', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('ends a round the clients never closed once the time limit passes', async () => {
    serveGame(describingGame('TMO-PRIMARY'));

    await pickWord('TMO-PRIMARY');
    expect(countRealtime('timeUp')).toBe(0);

    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 1000);

    expect(countRealtime('timeUp')).toBe(1);
    expect(updateExpressions()).toContain('set turnState = :t');
    expect(sentTo('conn-2').map(message => message.action)).toContain('timeUp');
  });

  test('leaves a round alone when the game already moved on', async () => {
    serveGame(describingGame('TMO-MOVED-ON', { turnState: 'CHOOSING_WORD' }));

    await pickWord('TMO-MOVED-ON');
    await vi.advanceTimersByTimeAsync((TIME_LIMIT + 20) * 1000);

    expect(countRealtime('timeUp')).toBe(0);
  });

  test('choosing a second word replaces the timer the first one armed', async () => {
    serveGame(describingGame('TMO-REARMED'));

    await pickWord('TMO-REARMED');
    await vi.advanceTimersByTimeAsync(1_000);
    await pickWord('TMO-REARMED', 'banana');

    // Past the first word's deadline, before the second word's.
    await vi.advanceTimersByTimeAsync(29_500);
    expect(countRealtime('timeUp')).toBe(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(countRealtime('timeUp')).toBe(1);
  });

  test('backup timers end the round when the primary one did not', async () => {
    serveGame(describingGame('TMO-BACKUP'));

    await pickWord('TMO-BACKUP');

    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 1000);
    expect(countRealtime('timeUp')).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(countRealtime('timeUp')).toBe(2);

    await vi.advanceTimersByTimeAsync(10_000);
    expect(countRealtime('timeUp')).toBe(3);
  });

  test('logs but survives a read failure in every round timer', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = describingGame('TMO-READ-FAIL');
    let readsFail = false;
    routeDb({
      get: () => {
        if (readsFail) throw new Error('read failed');
        return { Item: structuredClone(game) };
      },
    });

    await pickWord('TMO-READ-FAIL');
    readsFail = true;
    await vi.advanceTimersByTimeAsync((TIME_LIMIT + 20) * 1000);

    const logged = errorSpy.mock.calls.map(([message]) => String(message));
    expect(logged).toContain('Error in server-side timeout for game TMO-READ-FAIL:');
    expect(logged).toContain('Backup timeout 1 error for game TMO-READ-FAIL:');
    expect(logged).toContain('Backup timeout 2 error for game TMO-READ-FAIL:');
    expect(countRealtime('timeUp')).toBe(0);
  });

  test('stops force-ending a round that closed between the two reads', async () => {
    const game = describingGame('TMO-RACE');
    let reads = 0;
    routeDb({
      get: () => {
        reads += 1;
        // The timer's own check still sees DESCRIBING; forceEndRound's re-read does not.
        return { Item: { ...structuredClone(game), turnState: reads > 1 ? 'CHOOSING_WORD' : 'DESCRIBING' } };
      },
    });

    await pickWord('TMO-RACE');
    reads = 0;
    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 1000);

    expect(countRealtime('timeUp')).toBe(0);
    expect(updateExpressions()).not.toContain('set turnState = :t');
  });

  test('logs when the round cannot be marked as ending', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = describingGame('TMO-WRITE-FAIL');
    let writesFail = false;
    routeDb({
      get: () => ({ Item: structuredClone(game) }),
      update: () => {
        if (writesFail) throw new Error('write failed');
        return {};
      },
    });

    await pickWord('TMO-WRITE-FAIL');
    writesFail = true;
    await vi.advanceTimersByTimeAsync(TIME_LIMIT * 1000);

    expect(errorSpy).toHaveBeenCalledWith(
      'Failed to force end round for game TMO-WRITE-FAIL:',
      expect.any(Error),
    );
    expect(countRealtime('timeUp')).toBe(0);
  });
});

describe('Word choice timer', () => {
  const startingGame = (gameId: string) => ({
    gameId,
    gameState: 'STARTING',
    ownerId: 'conn-1',
    ownerSessionId: 'session-conn-1',
    players: [player('conn-1'), player('conn-2')],
    spectators: [player('spec-1')],
    currentDescriberIndex: 0,
    currentRound: 1,
    maxRounds: 2,
    timeLimit: TIME_LIMIT,
    turnState: 'CHOOSING_WORD',
    turnStartTime: new Date().toISOString(),
    wordOptions: ['apple', 'banana', 'orange'],
  });

  const start = (gameId: string) => default_handler(
    eventWith({ action: 'startGame', gameId, sessionId: 'session-conn-1', timeLimit: TIME_LIMIT, maxRounds: 2 }),
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
    // The start shuffle must keep the fixture order so the describer stays conn-1.
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  test('picks the first word for a describer who never chooses', async () => {
    const game = startingGame('TMO-PICK');
    routeDb({ get: () => ({ Item: game }), update: () => ({ Attributes: structuredClone(game) }) });

    await start('TMO-PICK');
    expect(sentTo('conn-1').map(message => message.action)).toContain('chooseWord');
    expect(sentTo('spec-1').map(message => message.action)).toContain('gameStarted');

    await vi.advanceTimersByTimeAsync(10_000);

    expect(sentTo('conn-1')).toContainEqual(
      expect.objectContaining({ action: 'describeWord', word: 'apple' }),
    );
  });

  test('logs when the word choice timer cannot read the game', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const game = startingGame('TMO-PICK-FAIL');
    let readsFail = false;
    routeDb({
      get: () => {
        if (readsFail) throw new Error('read failed');
        return { Item: game };
      },
      update: () => ({ Attributes: structuredClone(game) }),
    });

    await start('TMO-PICK-FAIL');
    readsFail = true;
    await vi.advanceTimersByTimeAsync(10_000);

    expect(errorSpy).toHaveBeenCalledWith(
      'Error in word choice timeout for game TMO-PICK-FAIL:',
      expect.any(Error),
    );
  });

  test('leaves the word alone when the describer chose before the timer fired', async () => {
    const game = startingGame('TMO-PICK-LATE');
    let turnState = 'CHOOSING_WORD';
    routeDb({
      get: () => ({ Item: { ...structuredClone(game), turnState } }),
      update: () => ({ Attributes: structuredClone(game) }),
    });

    await start('TMO-PICK-LATE');
    turnState = 'DESCRIBING';
    await vi.advanceTimersByTimeAsync(10_000);

    expect(sentTo('conn-1').map(message => message.action)).not.toContain('describeWord');
  });

  test('applies the round settings sent with startGame', async () => {
    const game = startingGame('TMO-SETTINGS');
    routeDb({ get: () => ({ Item: game }), update: () => ({ Attributes: structuredClone(game) }) });

    await default_handler(
      eventWith({ action: 'startGame', gameId: 'TMO-SETTINGS', sessionId: 'session-conn-1', timeLimit: 240, maxRounds: 5 }),
      {} as any,
      {} as any,
    );

    expect(mocks.updateCommand).toHaveBeenCalledWith(expect.objectContaining({
      ExpressionAttributeValues: expect.objectContaining({ ':tl': 240, ':m': 5 }),
    }));
  });
});
