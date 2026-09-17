import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  renderAndConnect,
  sendServerMessage,
  sendServerMessages,
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

installBrowserMocks();

const inProgress = (overrides: Record<string, any> = {}) => ({
  gameId: 'GAME123',
  gameState: 'IN_PROGRESS',
  players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
  ownerId: fixtures.TEST_CONN,
  currentRound: 1,
  currentDescriberIndex: 0,
  turnState: 'DESCRIBING',
  turnStartTime: new Date().toISOString(),
  timeLimit: 120,
  ...overrides,
});

describe('App - server messages with fields left out', () => {
  beforeEach(resetTestMocks);

  test('an error with no message shows the generic text', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'error' });

    await waitFor(() => expect(screen.getByText('An error occurred')).toBeInTheDocument());
  });

  test('time up with no word or message falls back to the standard banner', async () => {
    await renderAndConnect(App);
    sendServerMessages(fixtures.gameStarted({ currentDescriberIndex: 0 }), { action: 'timeUp' });

    await waitFor(() =>
      expect(screen.getByText("⏰ Time's up! Moving to next turn...")).toBeInTheDocument()
    );
    expect(screen.queryByText(/The word was:/)).not.toBeInTheDocument();
  });

  test('a player leaving with no message still says someone left', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'playerLeft', game: inProgress() },
    );

    await waitFor(() => expect(screen.getByText('A player left the game')).toBeInTheDocument());
  });

  test('an empty public games list shows the empty state', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'publicGamesList' });

    await waitFor(() => expect(screen.getByText('No public rooms')).toBeInTheDocument());
  });

  test('a status message with no timestamp is still shown', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'statusMessage', message: 'TestPlayer is choosing a word...' },
    );

    await waitFor(() =>
      expect(screen.getByText('TestPlayer is choosing a word...')).toBeInTheDocument()
    );
  });

  test('a turn that starts without a hint shows the pending placeholder', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'turnStarted', game: inProgress({ currentDescriberIndex: 1 }) });

    await waitFor(() => expect(screen.getByText('Hint pending')).toBeInTheDocument());
  });

  test('a heartbeat carrying a hint updates the hint rail', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      { action: 'turnStarted', game: inProgress({ currentDescriberIndex: 1 }), hint: '_ _ _' },
      { action: 'heartbeatAck', currentHint: 'a p _' },
    );

    await waitFor(() => expect(screen.getAllByText('p')).not.toHaveLength(0));
  });

  test('a next turn without round numbers skips the round banner', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'nextTurn', game: inProgress({ currentRound: undefined, maxRounds: undefined }) },
    );

    await waitFor(() => expect(screen.getByText(/Game in Progress/)).toBeInTheDocument());
    expect(screen.queryByText(/Next turn!/)).not.toBeInTheDocument();
  });

  test('a restart that carries a message shows it in the chat', async () => {
    await renderAndConnect(App);
    // The chat only renders mid-game, so the restarted game is served in progress.
    sendServerMessage({
      action: 'gameRestarted',
      message: 'You have rejoined the game!',
      game: inProgress({ currentDescriberIndex: 1 }),
    });

    await waitFor(() =>
      expect(screen.getByText('You have rejoined the game!')).toBeInTheDocument()
    );
  });

  test('a guess with no speaker prefix is labelled generically', async () => {
    const { container } = await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'newGuess', text: 'pineapple' },
    );

    await waitFor(() => expect(container.querySelector('.chat-stream .who')).toBeInTheDocument());
    expect(container.querySelector('.chat-stream .who')).toHaveTextContent('Guess');
    expect(container.querySelector('.chat-stream .body')).toHaveTextContent('pineapple');
  });

  test('a public room already playing, with nobody listed, still renders', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'publicGamesList',
      games: [{ gameId: 'PLAYING1', gameState: 'IN_PROGRESS', players: [] }],
    });

    await waitFor(() => expect(screen.getByText('Open room')).toBeInTheDocument());
    expect(screen.getByText('Playing')).toBeInTheDocument();
  });
});
