import { screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockSend,
  renderAndConnect,
  sendServerMessage,
  sendServerMessages,
  mockWebSocketInstances,
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

// Only the Supabase channel arms a round timer with a live socket, so the
// countdown tests drive the game through a game_status broadcast.
// `var` avoids the temporal dead zone: vitest hoists the factory above this file.
var mockRealtime: { handlers: Record<string, (payload: any) => void> };

vi.mock('./supabase', () => {
  const channel: any = {
    on: (_type: string, filter: { event: string }, handler: (payload: any) => void) => {
      mockRealtime.handlers[filter.event] = handler;
      return channel;
    },
    subscribe: () => channel,
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => {},
    },
  };
});

mockRealtime = { handlers: {} };

installBrowserMocks();

const sentActions = () => mockSend.mock.calls.map(([payload]) => JSON.parse(payload as string));

const countAction = (action: string) => sentActions().filter(message => message.action === action).length;

const describedGame = (overrides: Record<string, any> = {}) => ({
  gameId: 'GAME123',
  gameState: 'IN_PROGRESS',
  turnState: 'DESCRIBING',
  players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
  ownerId: fixtures.TEST_CONN,
  currentRound: 1,
  maxRounds: 2,
  timeLimit: 3,
  turnStartTime: new Date().toISOString(),
  ...overrides,
});

const tick = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

const emitGameStatus = (game: any) => {
  act(() => {
    mockRealtime.handlers['game_status']({ payload: game });
  });
};

/** Gets into a game so the Supabase channel is subscribed and can drive it. */
const startRound = async (game: any = describedGame()) => {
  await renderAndConnect(App);
  sendServerMessage(fixtures.gameCreated());
  await waitFor(() => expect(mockRealtime.handlers['game_status']).toBeDefined());
  emitGameStatus(game);
};

describe('App - timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTestMocks();
    mockRealtime.handlers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('counts the round down and reports time up once, then retries', async () => {
    await startRound();

    await waitFor(() => expect(screen.getByText('00:03')).toBeInTheDocument());

    await tick(1000);
    expect(screen.getByText('00:02')).toBeInTheDocument();

    await tick(2000);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(countAction('timeUp')).toBe(1);

    // One retry a second later covers a dropped message; no more after that.
    await tick(1000);
    expect(countAction('timeUp')).toBe(2);

    await tick(5000);
    expect(countAction('timeUp')).toBe(2);
  });

  test('reports time up straight away for a round that already expired', async () => {
    await startRound(describedGame({ turnStartTime: new Date(Date.now() - 10_000).toISOString() }));

    await waitFor(() => expect(countAction('timeUp')).toBe(1));
    expect(screen.getByText('00:00')).toBeInTheDocument();
  });

  test('drops the pending retry when the game ends first', async () => {
    await startRound();

    await tick(3000);
    expect(countAction('timeUp')).toBe(1);

    emitGameStatus(describedGame({ gameState: 'ENDED', turnState: undefined }));
    await tick(5000);

    expect(countAction('timeUp')).toBe(1);
  });

  test('drops the pending retry when the next turn starts', async () => {
    await startRound();

    await tick(3000);
    expect(countAction('timeUp')).toBe(1);

    emitGameStatus(describedGame({ turnStartTime: new Date().toISOString(), timeLimit: 60 }));
    await tick(5000);

    expect(countAction('timeUp')).toBe(1);
  });

  test('heartbeats every five seconds, carrying the game id once in a game', async () => {
    await renderAndConnect(App);

    await tick(5000);
    const lobbyBeat = sentActions().find(message => message.action === 'heartbeat');
    expect(lobbyBeat).toMatchObject({ action: 'heartbeat' });
    expect(lobbyBeat).not.toHaveProperty('gameId');

    sendServerMessage(fixtures.gameCreated());
    await tick(5000);

    expect(sentActions()).toContainEqual(expect.objectContaining({
      action: 'heartbeat',
      gameId: 'GAME123',
    }));
  });

  test('refreshes the public game list while sitting in the lobby', async () => {
    await renderAndConnect(App);
    await waitFor(() => expect(countAction('listPublicGames')).toBe(1));

    await tick(10_000);

    expect(countAction('listPublicGames')).toBe(3);
  });

  test('asks for a fresh hint every ten seconds, and every two once time is short', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'turnStarted',
      game: describedGame({ timeLimit: 60 }),
      hint: '_ _ _',
    });

    await tick(10_000);
    expect(countAction('updateHint')).toBe(1);

    // Under ten seconds left the aggressive timer kicks in alongside the slow one.
    sendServerMessage({
      action: 'turnStarted',
      game: describedGame({ timeLimit: 8, turnStartTime: new Date().toISOString() }),
      hint: '_ _ _',
    });
    await waitFor(() => expect(screen.getByText('00:08')).toBeInTheDocument());

    const before = countAction('updateHint');
    await tick(4000);
    expect(countAction('updateHint')).toBe(before + 2);
  });

  test('clears an error banner after five seconds', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'error', message: 'Something broke' });

    await waitFor(() => expect(screen.getByText('Something broke')).toBeInTheDocument());

    await tick(5000);

    expect(screen.queryByText('Something broke')).not.toBeInTheDocument();
  });

  test('counts the word picker down from ten seconds', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted(),
      { action: 'chooseWord', wordOptions: ['cat', 'dog', 'bird'] },
    );

    await waitFor(() => expect(screen.getByText('0:10')).toBeInTheDocument());

    await tick(3000);
    expect(screen.getByText('0:07')).toBeInTheDocument();

    await tick(7000);
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  test('resets the copy-link confirmation after two seconds', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => expect(screen.getByText('📋 Copy')).toBeInTheDocument());
    fireEvent.click(screen.getByText('📋 Copy'));

    await waitFor(() => expect(screen.getByText('✅ Copied!')).toBeInTheDocument());

    await tick(2000);

    expect(screen.getByText('📋 Copy')).toBeInTheDocument();
  });
});

describe('App - rounds without a usable clock', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTestMocks();
    mockRealtime.handlers = {};
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('arms no countdown for a round that never recorded a start time', async () => {
    await startRound(describedGame({ turnStartTime: undefined }));

    await tick(5000);

    expect(countAction('timeUp')).toBe(0);
  });

  test('arms no countdown for a round with no time limit', async () => {
    await startRound(describedGame({ timeLimit: undefined }));

    await tick(5000);

    expect(countAction('timeUp')).toBe(0);
  });

  test('reports an expired round once however often it is re-sent', async () => {
    const expired = describedGame({ turnStartTime: new Date(Date.now() - 10_000).toISOString() });
    await startRound(expired);

    await waitFor(() => expect(countAction('timeUp')).toBe(1));

    emitGameStatus({ ...expired, currentRound: 1 });
    await tick(100);

    expect(countAction('timeUp')).toBe(1);
  });

  // The retry holds the sendMessage from the render that armed the timer, so its
  // connected check is stale and the write lands on an already closed socket.
  test('still fires the time-up retry after the socket has closed', async () => {
    await startRound();

    await tick(3000);
    expect(countAction('timeUp')).toBe(1);

    act(() => {
      mockWebSocketInstances[0].onclose(new CloseEvent('close'));
    });
    await tick(1000);

    expect(countAction('timeUp')).toBe(2);
  });

  test('holds the heartbeat back while the socket is not open', async () => {
    await renderAndConnect(App);
    mockWebSocketInstances[0].readyState = 3;

    await tick(15_000);

    expect(countAction('heartbeat')).toBe(0);
  });
});
