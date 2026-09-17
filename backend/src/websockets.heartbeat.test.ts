import {
  eventWith,
  mocks,
  player,
  recipientsOf,
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

const GAME_ID = 'HB1';

const describedRound = (overrides: Record<string, unknown> = {}) => ({
  gameId: GAME_ID,
  gameState: 'IN_PROGRESS',
  ownerId: 'conn-1',
  ownerSessionId: 'session-conn-1',
  players: [player('conn-1'), player('conn-2')],
  spectators: [player('spec-1')],
  currentDescriberIndex: 0,
  currentRound: 1,
  maxRounds: 2,
  timeLimit: 300,
  turnState: 'DESCRIBING',
  turnStartTime: new Date(Date.now() - 30_000).toISOString(),
  secretWord: 'apple',
  currentHint: 'a _ _ _ _',
  ...overrides,
});

const beat = (connectionId: string, body: Record<string, unknown> = {}) => default_handler(
  eventWith({ action: 'heartbeat', gameId: GAME_ID, sessionId: `session-${connectionId}`, ...body }, connectionId),
  {} as any,
  {} as any,
);

describe('Heartbeat hint refresh', () => {
  beforeEach(resetMocks);

  test('pushes a newly revealed hint to guessers and spectators', async () => {
    mocks.generateHint.mockReturnValue('a p _ _ _');
    serveGame(describedRound());

    await beat('conn-2');

    expect(recipientsOf('hintUpdated')).toEqual(['conn-2', 'spec-1']);
    expect(updateExpressions()).toContain('set currentHint = :h');
    expect(sentTo('conn-2')).toContainEqual({ action: 'heartbeatAck', currentHint: 'a p _ _ _' });
  });

  test('skips the write and the broadcast when the hint has not moved on', async () => {
    mocks.generateHint.mockReturnValue('a _ _ _ _');
    serveGame(describedRound());

    await beat('conn-2');

    expect(recipientsOf('hintUpdated')).toEqual([]);
    expect(updateExpressions()).not.toContain('set currentHint = :h');
    expect(sentTo('conn-2')).toContainEqual({ action: 'heartbeatAck', currentHint: 'a _ _ _ _' });
  });

  test('does not hand the hint back to the describer', async () => {
    mocks.generateHint.mockReturnValue('a p _ _ _');
    serveGame(describedRound());

    await beat('conn-1');

    expect(sentTo('conn-1')).toContainEqual({ action: 'heartbeatAck' });
    expect(recipientsOf('hintUpdated')).toEqual(['conn-2', 'spec-1']);
  });

  test('ends an overdue round instead of refreshing its hint', async () => {
    serveGame(describedRound({ turnStartTime: new Date(Date.now() - 400_000).toISOString() }));

    await beat('conn-2');

    expect(recipientsOf('timeUp')).toEqual(['conn-1', 'conn-2', 'spec-1']);
    expect(recipientsOf('hintUpdated')).toEqual([]);
  });
});

describe('Heartbeat game lookup', () => {
  beforeEach(resetMocks);

  test('falls back to a scan when the direct read fails', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.generateHint.mockReturnValue('a p _ _ _');
    const game = describedRound();
    routeDb({
      get: () => { throw new Error('read failed'); },
      scan: () => ({ Items: [structuredClone(game)] }),
    });

    await beat('conn-2');

    expect(errorSpy).toHaveBeenCalledWith(`Error fetching specific game ${GAME_ID}:`, expect.any(Error));
    expect(sentTo('conn-2')).toContainEqual({ action: 'heartbeatAck', currentHint: 'a p _ _ _' });
  });

  test('falls back to a scan when the game is not at that key', async () => {
    const game = describedRound();
    routeDb({
      get: () => ({}),
      scan: () => ({ Items: [structuredClone(game)] }),
    });

    await beat('conn-2');

    expect(mocks.scanCommand).toHaveBeenCalled();
    expect(sentTo('conn-2')).toContainEqual(expect.objectContaining({ action: 'heartbeatAck' }));
  });
});

describe('Heartbeat from outside the game', () => {
  beforeEach(resetMocks);

  test('acknowledges a spectator without rewriting the player list', async () => {
    serveGame(describedRound());

    await beat('spec-1');

    expect(mocks.updateCommand).not.toHaveBeenCalledWith(
      expect.objectContaining({ UpdateExpression: 'set players = :p' }),
    );
    expect(sentTo('spec-1')).toContainEqual(expect.objectContaining({ action: 'heartbeatAck' }));
  });
});
