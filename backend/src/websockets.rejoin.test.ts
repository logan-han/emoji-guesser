import {
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

const GAME_ID = 'RJ1';

const runningGame = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_ID,
  gameState: 'IN_PROGRESS',
  ownerId: 'conn-1',
  ownerSessionId: 'session-conn-1',
  players: [player('conn-1'), player('conn-2')],
  spectators: [],
  currentDescriberIndex: 0,
  currentRound: 1,
  maxRounds: 2,
  timeLimit: 60,
  turnState: 'DESCRIBING',
  turnStartTime: new Date().toISOString(),
  secretWord: 'apple',
  currentHint: 'a _ _ _ _',
  wordOptions: ['apple', 'banana', 'orange'],
  ...overrides,
});

const send = (body: Record<string, unknown>, connectionId: string) =>
  default_handler(eventWith({ gameId: GAME_ID, ...body }, connectionId), {} as any, {} as any);

const rejoin = (body: Record<string, unknown>, connectionId: string) =>
  send({ action: 'joinGame', ...body }, connectionId);

const namesWritten = (): string[] =>
  mocks.updateCommand.mock.calls
    .flatMap(([input]: any[]) => input.ExpressionAttributeValues?.[':p'] ?? [])
    .map((p: any) => p.name);

describe('Reconnecting to a game already in progress', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  test('keeps the old name when the one sent on reconnect sanitises away', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-conn-2', playerName: '<b></b>' }, 'conn-9');

    expect(namesWritten()).toContain('Player conn-2');
    expect(sentTo('conn-9').map(message => message.action)).toContain('playerJoined');
  });

  test('takes the new name when the reconnect sends a usable one', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-conn-2', playerName: 'Renamed' }, 'conn-9');

    expect(namesWritten()).toContain('Renamed');
  });

  test('moves ownership to the new connection when the owner comes back', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-conn-1' }, 'conn-owner-2');

    expect(mocks.updateCommand).toHaveBeenCalledWith(
      expect.objectContaining({ UpdateExpression: 'set players = :p, ownerId = :o' }),
    );
    expect(recipientsOf('playerReconnected')).toEqual(['conn-2']);
  });

  test('sends the word back to a describer who reconnects mid-choice', async () => {
    serveGame(runningGame({ turnState: 'CHOOSING_WORD', secretWord: undefined }));

    await rejoin({ sessionId: 'session-conn-1' }, 'conn-1');

    expect(sentTo('conn-1')).toContainEqual({
      action: 'chooseWord',
      wordOptions: ['apple', 'banana', 'orange'],
    });
  });

  test('tells a reconnecting describer nothing when the round has no word yet', async () => {
    serveGame(runningGame({ secretWord: undefined }));

    await rejoin({ sessionId: 'session-conn-1' }, 'conn-1');

    const actions = sentTo('conn-1').map(message => message.action);
    expect(actions).toEqual(['playerJoined']);
  });

  test('tells a reconnecting guesser nothing when no hint has been revealed', async () => {
    serveGame(runningGame({ currentHint: undefined }));

    await rejoin({ sessionId: 'session-conn-2' }, 'conn-2');

    const actions = sentTo('conn-2').map(message => message.action);
    expect(actions).toEqual(['playerJoined']);
  });

  test('hands a reconnecting guesser the hint the round is up to', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-conn-2' }, 'conn-2');

    expect(sentTo('conn-2')).toContainEqual({ action: 'hintUpdated', hint: 'a _ _ _ _' });
  });
});

describe('Joining as someone new', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  const newSpectatorName = (): string => sentTo('conn-new')
    .filter(message => message.action === 'spectatorJoined')
    .map(message => message.game.spectators.at(-1).name)[0];

  test('invents a name when the one sent is only markup', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-new', playerName: '<i></i>' }, 'conn-new');

    expect(newSpectatorName()).toMatch(/^\w+ \w+ \d{2}$/);
  });

  test('keeps a usable name for a new spectator', async () => {
    serveGame(runningGame());

    await rejoin({ sessionId: 'session-new', playerName: 'Watcher' }, 'conn-new');

    expect(newSpectatorName()).toBe('Watcher');
  });
});

describe('Ownership checks that fall back to the session', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  // startGame reads the game back out of the conditional update, not a get.
  const serveStartingGame = (game: any) => routeDb({
    get: () => ({ Item: structuredClone(game) }),
    update: () => ({ Attributes: structuredClone(game) }),
  });

  test('lets the owner start a game from a connection the game has not seen yet', async () => {
    serveStartingGame(runningGame({ gameState: 'STARTING', turnState: undefined }));

    await send({ action: 'startGame', sessionId: 'session-conn-1' }, 'conn-fresh');

    expect(sentTo('conn-fresh').map(message => message.action)).not.toContain('error');
    expect(mocks.getRandomWords).toHaveBeenCalled();
  });

  test('refuses a start from someone who is neither owner connection nor owner session', async () => {
    serveStartingGame(runningGame({ gameState: 'STARTING', turnState: undefined }));

    await send({ action: 'startGame', sessionId: 'session-conn-2' }, 'conn-2');

    expect(sentTo('conn-2')).toContainEqual({
      action: 'error',
      message: 'Only the owner can start the game.',
    });
  });
});

describe('Rejoining a finished game', () => {
  beforeEach(() => {
    resetMocks();
    vi.clearAllTimers();
  });

  // The owner search skips the sessionId comparison for players that have none,
  // which is how a game recorded before session ids were sent still restarts.
  test('promotes the first player back when no sessionless player can claim ownership', async () => {
    const endedGame = {
      ...runningGame({ gameState: 'ENDED', turnState: undefined }),
      ownerId: 'conn-gone',
      ownerSessionId: 'session-gone',
      players: [player('conn-2', { sessionId: undefined }), player('conn-3')],
    };
    routeDb({ get: () => ({ Item: structuredClone(endedGame) }) });

    await send({ action: 'restartGame', sessionId: 'session-conn-3' }, 'conn-3');

    expect(sentTo('conn-3')).toContainEqual(expect.objectContaining({
      action: 'gameRestarted',
      isNewOwner: true,
      message: 'You are now the game owner!',
    }));
  });

  test('leaves ownership alone when the owner is still waiting to play again', async () => {
    const endedGame = {
      ...runningGame({ gameState: 'ENDED', turnState: undefined }),
      players: [player('conn-1'), player('conn-2')],
    };
    routeDb({ get: () => ({ Item: structuredClone(endedGame) }) });

    await send({ action: 'restartGame', sessionId: 'session-conn-2' }, 'conn-2');

    expect(sentTo('conn-2')).toContainEqual(expect.objectContaining({
      action: 'gameRestarted',
      isNewOwner: false,
      message: 'You have rejoined the game!',
    }));
  });
});
