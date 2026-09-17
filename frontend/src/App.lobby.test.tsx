import { screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockSend,
  renderAndConnect,
  sendServerMessage,
  sessionStorageMock,
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

installBrowserMocks();

const sentMessages = () => mockSend.mock.calls.map(([payload]) => JSON.parse(payload as string));

describe('App - lobby flow', () => {
  beforeEach(resetTestMocks);

  test('creating a game sends sanitized createGame settings over the socket', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: '  <b>TestPlayer</b>  ' } });
    fireEvent.click(screen.getByText('Create New Game'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('createGame')));

    const createPayload = mockSend.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.includes('"action":"createGame"'));
    expect(createPayload).toBeDefined();
    const createMessage = JSON.parse(createPayload as string);
    expect(createMessage).toMatchObject({
      action: 'createGame',
      playerName: 'TestPlayer',
      timeLimit: 120,
      maxRounds: 2,
      isPublic: false,
    });
    expect(createMessage.sessionId).toEqual(expect.any(String));
  });

  test('shows the lobby UI when gameCreated is received', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => {
      expect(screen.getByText('🎯 Game Lobby')).toBeInTheDocument();
      expect(screen.getByText('GAME123')).toBeInTheDocument();
    });
  });

  test('joining by game ID sends a joinGame action', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'TestPlayer' } });
    fireEvent.change(screen.getByPlaceholderText('Enter Game ID'), { target: { value: 'GAME123' } });
    fireEvent.click(screen.getByText('Join Game'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('joinGame'));
    });
  });

  test('editing the player name in the lobby sends updatePlayerName', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => expect(screen.getByText('TestPlayer')).toBeInTheDocument());

    fireEvent.click(screen.getByText('(click to edit)'));
    const input = screen.getByPlaceholderText('Enter your name (required)');
    fireEvent.change(input, { target: { value: 'NewName' } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('updatePlayerName'));
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('NewName'));
    });
  });

  test('toggles between private and public game radios', async () => {
    await renderAndConnect(App);

    const privateRadio = screen.getByLabelText('Private Game');
    const publicRadio = screen.getByLabelText('Public Game');

    expect(privateRadio).toBeChecked();
    expect(publicRadio).not.toBeChecked();

    fireEvent.click(publicRadio);

    expect(publicRadio).toBeChecked();
    expect(privateRadio).not.toBeChecked();

    fireEvent.click(privateRadio);

    expect(privateRadio).toBeChecked();
    expect(publicRadio).not.toBeChecked();
  });

  test('switches visibility with the segmented control', async () => {
    await renderAndConnect(App);

    const publicTab = screen.getByRole('tab', { name: /Public Game/ });
    const privateTab = screen.getByRole('tab', { name: /Private Game/ });

    fireEvent.click(publicTab);
    expect(publicTab).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(privateTab);
    expect(privateTab).toHaveAttribute('aria-selected', 'true');
  });

  test('copies the invite link to clipboard and shows confirmation', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => expect(screen.getByText('Invite Link:')).toBeInTheDocument());

    fireEvent.click(screen.getByText('📋 Copy'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'http://localhost/?gameId=GAME123'
    );
    await waitFor(() => expect(screen.getByText('✅ Copied!')).toBeInTheDocument());
  });

  test('logs error when clipboard copy fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.assign(navigator, {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Copy failed')) },
    });

    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => expect(screen.getByText('📋 Copy')).toBeInTheDocument());
    fireEvent.click(screen.getByText('📋 Copy'));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });

  test('joining as a spectator switches the UI into Spectator Mode', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'spectatorJoined',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [
          { name: 'Player1', connectionId: 'conn-1', score: 50 },
          { name: 'Player2', connectionId: 'conn-2', score: 30 },
        ],
        ownerId: 'conn-1',
        currentRound: 1,
        currentDescriberIndex: 0,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Spectator Mode/)).toBeInTheDocument();
    });
  });

  test('renders the list of public games when publicGamesList is received', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'publicGamesList',
      games: [
        {
          gameId: 'PUBLIC1',
          gameState: 'WAITING',
          players: [{ name: 'Host', connectionId: 'host-conn', score: 0 }],
        },
      ],
    });

    await waitFor(() => {
      expect(screen.getByText('#PUBLIC1')).toBeInTheDocument();
    });
  });

  test('updates the player count when a player rejoins', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());

    await waitFor(() => expect(screen.getByText(/Game Lobby/)).toBeInTheDocument());

    sendServerMessage({
      action: 'playerRejoined',
      rejoinedPlayer: 'Player2',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [
          fixtures.player(),
          { name: 'Player2', connectionId: 'conn-2', score: 0 },
        ],
        ownerId: fixtures.TEST_CONN,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument();
    });
  });

  test('shows spectators alongside players in the lobby', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        spectators: [{ name: 'Spectator1', connectionId: 'spec-1' }],
      })
    );

    await waitFor(() => {
      expect(screen.getByText('Spectators (1)')).toBeInTheDocument();
      expect(screen.getByText('Spectator1')).toBeInTheDocument();
    });
  });

  test('carries the chosen rounds and round time into createGame', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Rounds'), { target: { value: '4' } });
    fireEvent.change(screen.getByLabelText('Round time'), { target: { value: '180' } });
    fireEvent.click(screen.getByText('Create New Game'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('createGame')));

    expect(sentMessages()).toContainEqual(expect.objectContaining({
      action: 'createGame',
      maxRounds: 4,
      timeLimit: 180,
    }));
  });

  test('clicking a public room joins that game', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'publicGamesList',
      games: [
        {
          gameId: 'PUBLIC1',
          gameState: 'WAITING',
          players: [{ name: 'Host', connectionId: 'host-conn', score: 0 }],
        },
      ],
    });

    await waitFor(() => expect(screen.getByText('#PUBLIC1')).toBeInTheDocument());
    fireEvent.click(screen.getByText('#PUBLIC1'));

    expect(sentMessages()).toContainEqual(expect.objectContaining({
      action: 'joinGame',
      gameId: 'PUBLIC1',
    }));
  });

  test('counts the players who have not opted into another game', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        players: [
          fixtures.player(),
          { name: 'Player2', connectionId: 'conn-2', score: 0, wantsToPlayAgain: false },
        ],
      })
    );

    await waitFor(() =>
      expect(screen.getByText('1 player(s) waiting to rejoin')).toBeInTheDocument()
    );
  });

  test('tracks a spectator by session id when their connection changes', async () => {
    await renderAndConnect(App);
    const sessionId = sessionStorageMock.setItem.mock.calls
      .find(([key]) => key === 'emoji-guesser-session')?.[1];

    sendServerMessage({
      action: 'spectatorJoined',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [{ name: 'Player1', connectionId: 'conn-1', score: 0 }],
        spectators: [{ name: 'Watcher', connectionId: 'spec-9', sessionId, score: 0 }],
        ownerId: 'conn-1',
        currentRound: 1,
        currentDescriberIndex: 0,
      },
    });

    await waitFor(() => expect(screen.getByText(/Spectator Mode/)).toBeInTheDocument());

    // The spectator's connection id is adopted, so the scoreboard stops marking
    // the unrelated conn-1 row as "you".
    expect(screen.queryByText('· you')).not.toBeInTheDocument();
  });

  test('reveals Start Game once the owner has two or more players', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        players: [
          fixtures.player({ wantsToPlayAgain: true }),
          { name: 'Player2', connectionId: 'conn-2', score: 0, wantsToPlayAgain: true },
        ],
      })
    );

    await waitFor(() => {
      expect(screen.getByText(/Start Game/)).toBeInTheDocument();
    });
  });

  test('the host starts the game with the round rules they picked', async () => {
    const { container } = await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        players: [
          fixtures.player({ wantsToPlayAgain: true }),
          { name: 'Player2', connectionId: 'conn-2', score: 0, wantsToPlayAgain: true },
        ],
      })
    );

    await waitFor(() => expect(screen.getByText(/Start Game/)).toBeInTheDocument());

    fireEvent.change(container.querySelector('#max-rounds')!, { target: { value: '5' } });
    fireEvent.change(container.querySelector('#time-limit')!, { target: { value: '300' } });
    fireEvent.click(screen.getByText(/Start Game/));

    expect(sentMessages()).toContainEqual(expect.objectContaining({
      action: 'startGame',
      gameId: 'GAME123',
      maxRounds: 5,
      timeLimit: 300,
    }));
  });

  describe('editing your name in the waiting room', () => {
    const openNameEditor = async () => {
      await renderAndConnect(App);
      sendServerMessage(fixtures.gameCreated());
      await waitFor(() => expect(screen.getByText('TestPlayer')).toBeInTheDocument());
      fireEvent.click(screen.getByText('(click to edit)'));
      return screen.getByPlaceholderText('Enter your name (required)');
    };

    test('blurring a blank field restores the previous name', async () => {
      const input = await openNameEditor();

      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.blur(input);

      await waitFor(() => expect(screen.getByText('TestPlayer')).toBeInTheDocument());
      expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('updatePlayerName'));
    });

    test('Enter commits the new name', async () => {
      const input = await openNameEditor();

      fireEvent.change(input, { target: { value: 'Renamed' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      expect(sentMessages()).toContainEqual(expect.objectContaining({
        action: 'updatePlayerName',
        name: 'Renamed',
      }));
    });

    test('Escape closes the editor without sending anything', async () => {
      const input = await openNameEditor();

      fireEvent.change(input, { target: { value: 'Discarded' } });
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() =>
        expect(screen.queryByPlaceholderText('Enter your name (required)')).not.toBeInTheDocument()
      );
      expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('updatePlayerName'));
    });

    test('a name made only of markup is rejected', async () => {
      const input = await openNameEditor();

      fireEvent.change(input, { target: { value: '<b></b>' } });
      fireEvent.blur(input);

      await waitFor(() =>
        expect(screen.getByText('Name must be 1-20 characters')).toBeInTheDocument()
      );
      expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('updatePlayerName'));
    });
  });
});
