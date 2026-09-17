import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockSend,
  mockWebSocketInstances,
  localStorageMock,
  renderAndConnect,
  sendServerMessage,
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

installBrowserMocks();

const sentActions = () => mockSend.mock.calls.map(([payload]) => JSON.parse(payload as string));

const countAction = (action: string) => sentActions().filter(message => message.action === action).length;

const closeSocket = (index = 0) => {
  act(() => {
    mockWebSocketInstances[index].onclose(new CloseEvent('close'));
  });
};

describe('App - acting on a closed socket', () => {
  beforeEach(resetTestMocks);

  test('will not let the lobby buttons fire while the socket is down', async () => {
    await renderAndConnect(App);
    fireEvent.change(screen.getByPlaceholderText('Enter Game ID'), { target: { value: 'GAME123' } });
    closeSocket();

    mockSend.mockClear();
    fireEvent.click(screen.getByText('Create New Game'));
    fireEvent.click(screen.getByText('Join Game'));

    expect(mockSend).not.toHaveBeenCalled();
  });

  test('stops asking for public games once the socket has gone', async () => {
    vi.useFakeTimers();
    try {
      await renderAndConnect(App);
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
      expect(countAction('listPublicGames')).toBeGreaterThan(0);

      closeSocket();
      mockSend.mockClear();
      await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });

      expect(countAction('listPublicGames')).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('App - the name sent when joining', () => {
  beforeEach(() => {
    resetTestMocks();
    window.history.replaceState({}, '', '/?gameId=SHARED1');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('uses the stored name when following a shared link', async () => {
    localStorageMock.getItem.mockReturnValue('StoredName');

    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    expect(sentActions()).toContainEqual(
      expect.objectContaining({ action: 'joinGame', gameId: 'SHARED1', playerName: 'StoredName' }),
    );
  });
});

describe('App - starting without a name', () => {
  beforeEach(resetTestMocks);

  test('invents a name for a game created with the field left blank', async () => {
    await renderAndConnect(App);

    fireEvent.click(screen.getByText('Create New Game'));

    const [created] = sentActions().filter(message => message.action === 'createGame');
    expect(created.playerName).toMatch(/^\w+ \w+ \d{2}$/);
  });

  test('invents a name for a join with the field left blank', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByPlaceholderText('Enter Game ID'), { target: { value: 'GAME123' } });
    fireEvent.click(screen.getByText('Join Game'));

    const [joined] = sentActions().filter(message => message.action === 'joinGame');
    expect(joined.playerName).toMatch(/^\w+ \w+ \d{2}$/);
  });

  test('holds Join Game back until a game id is typed', async () => {
    await renderAndConnect(App);

    expect(screen.getByText('Join Game')).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('Enter Game ID'), { target: { value: 'GAME123' } });

    expect(screen.getByText('Join Game')).toBeEnabled();
  });

  test('invents a name for a game created under a markup-only name', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '<b></b>' } });
    fireEvent.click(screen.getByText('Create New Game'));

    const [created] = sentActions().filter(message => message.action === 'createGame');
    expect(created.playerName).toMatch(/^\w+ \w+ \d{2}$/);
  });

  test('invents a name for a join under a markup-only name', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '<i></i>' } });
    fireEvent.change(screen.getByPlaceholderText('Enter Game ID'), { target: { value: 'GAME123' } });
    fireEvent.click(screen.getByText('Join Game'));

    const [joined] = sentActions().filter(message => message.action === 'joinGame');
    expect(joined.playerName).toMatch(/^\w+ \w+ \d{2}$/);
  });
});

describe('App - roles applied from a game update', () => {
  beforeEach(resetTestMocks);

  test('keeps the secret word when the update still has us describing', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    const describing = {
      gameId: 'GAME123',
      gameState: 'IN_PROGRESS',
      turnState: 'DESCRIBING',
      players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
      ownerId: fixtures.TEST_CONN,
      currentDescriberIndex: 0,
      currentRound: 1,
      maxRounds: 2,
      timeLimit: 120,
      turnStartTime: new Date().toISOString(),
    };
    sendServerMessage({ action: 'describeWord', word: 'apple', game: describing });
    sendServerMessage({ action: 'playerJoined', game: describing });

    await waitFor(() => expect(screen.getByText('apple')).toBeInTheDocument());
  });

  test('leaves the round timer alone when a player joins a lobby', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    sendServerMessage({
      action: 'playerJoined',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
        ownerId: fixtures.TEST_CONN,
      },
    });

    await waitFor(() => expect(screen.getByText('Player2')).toBeInTheDocument());
    expect(screen.getByText('🎯 Game Lobby')).toBeInTheDocument();
  });
});

describe('App - server messages with the game left out', () => {
  beforeEach(resetTestMocks);

  test('shows the word from describeWord that carries no game', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted());

    sendServerMessage({ action: 'describeWord', word: 'banana' });

    await waitFor(() => expect(screen.getByText('banana')).toBeInTheDocument());
  });

  test('a restart with neither ownership nor a message adds nothing to the chat', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameEnded());

    sendServerMessage({ action: 'gameRestarted', game: fixtures.gameCreated().game });

    await waitFor(() => expect(screen.getByText('🎯 Game Lobby')).toBeInTheDocument());
    expect(screen.queryByText('👑 You are now the game owner!')).not.toBeInTheDocument();
  });

  test('a heartbeat with no hint leaves the one on screen alone', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted({ turnState: 'DESCRIBING' }));
    sendServerMessage({ action: 'hintUpdated', hint: 'ap_' });
    await waitFor(() => expect(screen.getAllByText('p')).not.toHaveLength(0));

    sendServerMessage({ action: 'heartbeatAck' });

    expect(screen.getAllByText('p')).not.toHaveLength(0);
  });
});

describe('App - editing your name in the lobby', () => {
  const lobbyWithName = () => fixtures.gameCreated({
    players: [fixtures.player({ name: 'TestPlayer' }), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
  });

  const openNameEditor = async () => {
    await renderAndConnect(App);
    sendServerMessage(lobbyWithName());
    fireEvent.click(await screen.findByText('TestPlayer'));
    return screen.getByPlaceholderText('Enter your name (required)');
  };

  beforeEach(resetTestMocks);

  test('falls back to the name in the game once the field is emptied', async () => {
    const input = await openNameEditor();

    fireEvent.change(input, { target: { value: '' } });

    expect(input).toHaveValue('TestPlayer');
  });

  test('sends nothing when Enter is pressed on a blank field', async () => {
    const input = await openNameEditor();

    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(countAction('updatePlayerName')).toBe(0);
  });

  test('leaves the editor open for keys other than Enter and Escape', async () => {
    const input = await openNameEditor();

    fireEvent.keyDown(input, { key: 'a' });

    expect(screen.getByPlaceholderText('Enter your name (required)')).toBeInTheDocument();
  });

  test('closes the editor on Escape without sending anything', async () => {
    const input = await openNameEditor();

    fireEvent.keyDown(input, { key: 'Escape' });

    await waitFor(() =>
      expect(screen.queryByPlaceholderText('Enter your name (required)')).not.toBeInTheDocument());
    expect(countAction('updatePlayerName')).toBe(0);
  });
});

describe('App - players the server sent without a connection id', () => {
  const nameless = { name: 'NoConnection', score: 4 };

  beforeEach(resetTestMocks);

  test('lists them in the lobby and its spectator strip', async () => {
    await renderAndConnect(App);

    sendServerMessage(fixtures.gameCreated({
      players: [fixtures.player(), nameless],
      spectators: [{ name: 'NoConnSpectator' }],
    }));

    await waitFor(() => expect(screen.getByText('NoConnection')).toBeInTheDocument());
    expect(screen.getByText('NoConnSpectator')).toBeInTheDocument();
  });

  test('lists them in a public room preview', async () => {
    await renderAndConnect(App);

    sendServerMessage({
      action: 'publicGamesList',
      games: [{ gameId: 'PUB1', gameState: 'WAITING', players: [nameless] }],
    });

    await waitFor(() => expect(screen.getByText('NoConnection')).toBeInTheDocument());
  });

  test('ranks them on the in-game scoreboard', async () => {
    await renderAndConnect(App);

    sendServerMessage(fixtures.gameStarted({
      players: [fixtures.player(), nameless],
      turnState: 'DESCRIBING',
    }));

    await waitFor(() => expect(screen.getByText('NoConnection')).toBeInTheDocument());
  });

  test('ranks them below the podium on the results screen', async () => {
    await renderAndConnect(App);

    sendServerMessage(fixtures.gameEnded({
      players: [
        fixtures.player({ score: 50 }),
        { name: 'Second', connectionId: 'conn-2', score: 40 },
        { name: 'Third', connectionId: 'conn-3', score: 30 },
        nameless,
      ],
    }));

    await waitFor(() => expect(screen.getByText(/NoConnection/)).toBeInTheDocument());
  });

  test('crowns only the host among players the game does identify by session', async () => {
    await renderAndConnect(App);

    sendServerMessage(fixtures.gameCreated({
      players: [
        fixtures.player(),
        nameless,
        { name: 'Guest', connectionId: 'conn-2', sessionId: 'guest-session', score: 0 },
      ],
      ownerId: fixtures.TEST_CONN,
      ownerSessionId: 'owner-session',
    }));

    await waitFor(() => expect(screen.getByText('NoConnection')).toBeInTheDocument());
    expect(screen.getAllByTitle('Game Host')).toHaveLength(1);
  });
});

describe('App - players with no name to draw an avatar from', () => {
  beforeEach(resetTestMocks);

  test('falls back to a question mark in the avatar', async () => {
    await renderAndConnect(App);

    sendServerMessage(fixtures.gameCreated({
      players: [fixtures.player(), { name: '', connectionId: 'conn-2', score: 0 }],
    }));

    await waitFor(() => expect(screen.getByText('?')).toBeInTheDocument());
  });
});

describe('App - chat lines that are only a speaker', () => {
  beforeEach(resetTestMocks);

  test('falls back to the whole line when there is nothing after the colon', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted());

    sendServerMessage({ action: 'newGuess', text: 'TestPlayer:', guesserId: 'conn-2' });

    await waitFor(() => expect(screen.getAllByText('TestPlayer:')).toHaveLength(2));
  });
});
