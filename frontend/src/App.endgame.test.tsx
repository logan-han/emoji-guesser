import React from 'react';
import { screen, waitFor, fireEvent } from '@testing-library/react';
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

jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

installBrowserMocks();

describe('App - end-of-game, errors and restart', () => {
  beforeEach(resetTestMocks);

  test('renders an alert and message on the error action', async () => {
    await renderAndConnect(App);

    sendServerMessage({ action: 'error', message: 'Something went wrong' });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  test('renders the final scoreboard when the game ends', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameEnded({
        players: [{ name: 'Lucky Noodle 75', connectionId: 'test-conn', score: 100 }],
      })
    );

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());
    expect(screen.getAllByText('Lucky Noodle 75').length).toBeGreaterThan(0);
    expect(screen.getByText('100 pts')).toBeInTheDocument();
  });

  test('owner clicking Play Again sends restartGame', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameEnded({
        players: [{ ...fixtures.player({ score: 100, wantsToPlayAgain: false }) }],
      })
    );

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Play Again|Rejoin Game/));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('restartGame'));
    });
  });

  test('Back to Lobby returns to the create-game screen', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameEnded({
        players: [{ ...fixtures.player({ score: 100, wantsToPlayAgain: false }) }],
      })
    );

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Back to Lobby'));

    await waitFor(() => {
      expect(screen.getByText('Create New Game')).toBeInTheDocument();
    });
  });

  test('timeUp reveals the secret word with a Time\'s up banner', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted(),
      { action: 'timeUp', message: "⏰ Time's up!", word: 'secret' }
    );

    await waitFor(() => {
      expect(screen.getByText(/Time's up/)).toBeInTheDocument();
      expect(screen.getByText(/secret/)).toBeInTheDocument();
    });
  });

  test('player count decreases when playerLeft arrives', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        players: [
          fixtures.player(),
          { name: 'Player2', connectionId: 'conn-2', score: 0 },
        ],
      })
    );

    await waitFor(() => expect(screen.getByText(/Game Lobby/)).toBeInTheDocument());
    expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument();

    sendServerMessage({
      action: 'playerLeft',
      message: 'Player2 left the game',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [fixtures.player()],
        ownerId: fixtures.TEST_CONN,
      },
    });

    await waitFor(() => {
      expect(screen.getByText(/Players \(1\)/)).toBeInTheDocument();
    });
  });

  test('gameRestarted returns the UI to the lobby state', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'gameRestarted',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [fixtures.player()],
        ownerId: fixtures.TEST_CONN,
      },
      message: '🔄 Game restarted!',
    });

    await waitFor(() => {
      expect(screen.getByText(/Game Lobby/)).toBeInTheDocument();
      expect(screen.getByText('GAME123')).toBeInTheDocument();
    });
  });

  test('heartbeatAck outside an active game does not change the visible UI', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'heartbeatAck', currentHint: '_ _ _ _' });
    expect(screen.getByText(/Create New Game/)).toBeInTheDocument();
  });

  test('gameRestarted with isNewOwner=true crowns the rejoined player', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameCreated({
        players: [
          { name: 'OriginalOwner', connectionId: 'original-owner', score: 0 },
          fixtures.player(),
        ],
        ownerId: 'original-owner',
      })
    );

    await waitFor(() => expect(screen.getByText('TestPlayer')).toBeInTheDocument());

    sendServerMessage({
      action: 'gameRestarted',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [fixtures.player()],
        ownerId: fixtures.TEST_CONN,
      },
      isNewOwner: true,
    });

    await waitFor(() => {
      expect(screen.getByTitle('Game Host')).toBeInTheDocument();
    });
  });
});
