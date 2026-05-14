import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockSend,
  mockWebSocketInstances,
  renderAndConnect,
  sendServerMessage,
  fixtures,
} from './testUtils';

jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

installBrowserMocks();

describe('App - lobby flow', () => {
  beforeEach(resetTestMocks);

  test('creating a game sends a createGame action over the socket', async () => {
    await renderAndConnect(App);

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'TestPlayer' } });
    fireEvent.click(screen.getByText('Create New Game'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('createGame'));
    });
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
  });

  test('copies the invite link to clipboard and shows confirmation', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockResolvedValue(undefined) },
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
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    Object.assign(navigator, {
      clipboard: { writeText: jest.fn().mockRejectedValue(new Error('Copy failed')) },
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
});
