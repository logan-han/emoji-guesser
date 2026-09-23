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
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

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

/** Into a game, then a round starting the way the server announces one to a guesser. */
const startRound = async (game: any = describedGame()) => {
  await renderAndConnect(App);
  sendServerMessage(fixtures.gameCreated());
  sendServerMessage({ action: 'turnStarted', game, hint: '_ _ _' });
};

const serverKeepsTime = () => {
  expect(countAction('timeUp')).toBe(0);
  expect(countAction('updateHint')).toBe(0);
  expect(countAction('heartbeat')).toBe(0);
};

describe('App - timers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTestMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('counts the round down to zero and leaves ending it to the server', async () => {
    await startRound();

    await waitFor(() => expect(screen.getByText('00:03')).toBeInTheDocument());

    await tick(1000);
    expect(screen.getByText('00:02')).toBeInTheDocument();

    await tick(2000);
    expect(screen.getByText('00:00')).toBeInTheDocument();

    await tick(5000);
    expect(screen.getByText('00:00')).toBeInTheDocument();
    serverKeepsTime();
  });

  test('shows zero straight away for a round that already expired', async () => {
    await startRound(describedGame({ turnStartTime: new Date(Date.now() - 10_000).toISOString() }));

    await waitFor(() => expect(screen.getByText('00:00')).toBeInTheDocument());
    serverKeepsTime();
  });

  test("stops the countdown when the server calls time", async () => {
    await startRound(describedGame({ timeLimit: 60 }));
    await tick(2000);
    expect(screen.getByText('00:58')).toBeInTheDocument();

    sendServerMessage({ action: 'timeUp', word: 'cat' });
    await tick(3000);

    expect(screen.getByText('01:00')).toBeInTheDocument();
  });

  test('starts again from the top when the next turn starts', async () => {
    await startRound(describedGame({ timeLimit: 60 }));
    await tick(5000);

    sendServerMessage({ action: 'turnStarted', game: describedGame({ timeLimit: 90, turnStartTime: new Date().toISOString() }), hint: '_' });
    await waitFor(() => expect(screen.getByText('01:30')).toBeInTheDocument());
  });

  test('sends no heartbeats or hint requests, in the lobby or in a round', async () => {
    await renderAndConnect(App);
    await tick(15_000);
    sendServerMessage(fixtures.gameCreated());
    sendServerMessage({ action: 'turnStarted', game: describedGame({ timeLimit: 60 }), hint: '_ _ _' });
    await tick(30_000);

    serverKeepsTime();
  });

  test('refreshes the public game list while sitting in the lobby', async () => {
    await renderAndConnect(App);
    await waitFor(() => expect(countAction('listPublicGames')).toBe(1));

    await tick(10_000);

    expect(countAction('listPublicGames')).toBe(3);
  });

  test('skips the lobby refresh while the tab is hidden', async () => {
    await renderAndConnect(App);
    await waitFor(() => expect(countAction('listPublicGames')).toBe(1));
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    await tick(10_000);
    expect(countAction('listPublicGames')).toBe(1);

    visibility.mockRestore();
    await tick(5_000);
    expect(countAction('listPublicGames')).toBe(2);
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
    // The server picks the first word itself when the describer runs out of time.
    expect(countAction('chooseWord')).toBe(0);
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('arms no countdown for a round that never recorded a start time', async () => {
    await startRound(describedGame({ turnStartTime: undefined, timeLimit: 45 }));
    await waitFor(() => expect(screen.getByText('00:45')).toBeInTheDocument());

    await tick(5000);

    expect(screen.getByText('00:45')).toBeInTheDocument();
  });

  test('arms no countdown for a round with no time limit', async () => {
    await startRound(describedGame({ timeLimit: undefined }));

    await tick(5000);

    expect(screen.getByText('02:00')).toBeInTheDocument();
  });
});
