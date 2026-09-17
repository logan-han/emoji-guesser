import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockSend,
  mockWebSocketInstances,
  renderAndConnect,
  sendServerMessage,
  sendServerMessages,
  fixtures,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

installBrowserMocks();

const sentMessages = () => mockSend.mock.calls.map(([payload]) => JSON.parse(payload as string));

const describerTurn = () => {
  sendServerMessage(fixtures.gameStarted({ currentDescriberIndex: 0, turnState: 'CHOOSING_WORD' }));
  sendServerMessage({
    action: 'describeWord',
    word: 'elephant',
    game: {
      gameId: 'GAME123',
      gameState: 'IN_PROGRESS',
      players: [fixtures.player()],
      ownerId: fixtures.TEST_CONN,
      currentRound: 1,
      currentDescriberIndex: 0,
      turnState: 'DESCRIBING',
      turnStartTime: new Date().toISOString(),
      timeLimit: 120,
    },
  });
};

describe('App - gameplay', () => {
  beforeEach(resetTestMocks);

  test('shows "Game started" banner on gameStarted', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted());

    await waitFor(() => {
      expect(screen.getByText(/Game started!/)).toBeInTheDocument();
    });
  });

  test('accepts chooseWord without throwing', async () => {
    await renderAndConnect(App);
    expect(() => {
      sendServerMessage({ action: 'chooseWord', wordOptions: ['cat', 'dog', 'bird'] });
    }).not.toThrow();
  });

  test('describer selecting a word sends chooseWord with the chosen word', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted(),
      { action: 'chooseWord', wordOptions: ['cat', 'dog', 'bird'] }
    );

    await waitFor(() =>
      expect(screen.getByText(/Choose a Word to Describe/)).toBeInTheDocument()
    );

    fireEvent.click(screen.getByText('cat'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('chooseWord'));
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('cat'));
    });
  });

  test('guesser submitting a guess sends the sanitized text', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameStarted({
        players: [
          { name: 'TestPlayer', connectionId: 'other-conn', score: 0 },
          { name: 'Me', connectionId: 'test-conn', score: 0 },
        ],
        ownerId: 'other-conn',
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        currentHint: '_ _ _',
      })
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Type your guess...')).toBeInTheDocument()
    );

    fireEvent.change(screen.getByPlaceholderText('Type your guess...'), {
      target: { value: '  <b>DOG</b>  ' },
    });
    fireEvent.click(screen.getByText('Guess'));

    await waitFor(() => expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('submitGuess')));

    const guessPayload = mockSend.mock.calls
      .map(([payload]) => payload)
      .find((payload) => payload.includes('"action":"submitGuess"'));
    expect(guessPayload).toBeDefined();
    const guessMessage = JSON.parse(guessPayload as string);
    expect(guessMessage).toMatchObject({
      action: 'submitGuess',
      gameId: 'GAME123',
      guess: 'dog',
    });
  });

  test('rapid duplicate guesses are rate limited', async () => {
    await renderAndConnect(App);
    sendServerMessage(
      fixtures.gameStarted({
        players: [
          { name: 'Describer', connectionId: 'other-conn', score: 0 },
          { name: 'Me', connectionId: 'test-conn', score: 0 },
        ],
        ownerId: 'other-conn',
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        currentHint: '_ _ _',
      })
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText('Type your guess...')).toBeInTheDocument()
    );

    const nowSpy = vi.spyOn(Date, 'now')
      .mockReturnValueOnce(1000)
      .mockReturnValueOnce(1200);

    const input = screen.getByPlaceholderText('Type your guess...');
    fireEvent.change(input, { target: { value: 'dog' } });
    fireEvent.click(screen.getByText('Guess'));
    fireEvent.change(input, { target: { value: 'cat' } });
    fireEvent.click(screen.getByText('Guess'));

    const submitGuesses = mockSend.mock.calls
      .map(([payload]) => JSON.parse(payload))
      .filter((payload) => payload.action === 'submitGuess');
    expect(submitGuesses).toHaveLength(1);
    expect(submitGuesses[0].guess).toBe('dog');

    nowSpy.mockRestore();
  });

  test('renders incoming emojis on the screen', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'newEmoji', emoji: '🎉' }
    );

    await waitFor(() => {
      expect(screen.getByText(/🎉/)).toBeInTheDocument();
    });
  });

  test('renders guesses sent via newGuess', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'newGuess', text: 'Player2: apple' }
    );

    await waitFor(() => {
      expect(screen.getByText('Player2: apple')).toBeInTheDocument();
    });
  });

  test('announces the correct guesser and word on wordGuessed', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted(),
      {
        action: 'wordGuessed',
        guesserName: 'Player2',
        word: 'elephant',
        game: {
          gameId: 'GAME123',
          gameState: 'IN_PROGRESS',
          players: [
            { name: 'TestPlayer', connectionId: 'test-conn', score: 75 },
            { name: 'Player2', connectionId: 'conn-2', score: 100 },
          ],
          ownerId: 'test-conn',
          currentRound: 1,
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText(/Player2 guessed correctly/)).toBeInTheDocument();
      expect(screen.getByText(/elephant/)).toBeInTheDocument();
    });
  });

  test('updates the round indicator on nextTurn', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ maxRounds: 2 }),
      {
        action: 'nextTurn',
        game: {
          gameId: 'GAME123',
          gameState: 'IN_PROGRESS',
          players: [fixtures.player()],
          ownerId: 'test-conn',
          currentRound: 1,
          maxRounds: 2,
          currentDescriberIndex: 1,
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText(/Round 1 of 2/)).toBeInTheDocument();
    });
  });

  test('shows the secret word to the describer on describeWord', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted({
      currentDescriberIndex: 0,
      turnState: 'CHOOSING_WORD',
    }));

    await waitFor(() => expect(screen.getByText(/Game in Progress/)).toBeInTheDocument());

    sendServerMessage({
      action: 'describeWord',
      word: 'elephant',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [fixtures.player()],
        currentRound: 1,
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        turnStartTime: new Date().toISOString(),
        timeLimit: 120,
      },
    });

    await waitFor(() => {
      expect(screen.getByText('elephant')).toBeInTheDocument();
    });
  });

  test('shows "<player> is now describing" on turnStarted', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({
        players: [
          { name: 'Player1', connectionId: 'conn-1', score: 0 },
          { name: 'TestPlayer', connectionId: 'test-conn', score: 0 },
        ],
        ownerId: 'conn-1',
        currentDescriberIndex: 0,
      }),
      {
        action: 'turnStarted',
        hint: '_ _ _ _ _',
        game: {
          gameId: 'GAME123',
          gameState: 'IN_PROGRESS',
          players: [
            { name: 'Player1', connectionId: 'conn-1', score: 0 },
            { name: 'TestPlayer', connectionId: 'test-conn', score: 0 },
          ],
          currentRound: 1,
          currentDescriberIndex: 0,
          turnState: 'DESCRIBING',
          turnStartTime: new Date().toISOString(),
          timeLimit: 120,
        },
      }
    );

    await waitFor(() => {
      expect(screen.getByText(/Player1 is now describing/)).toBeInTheDocument();
    });
  });

  test('hides the secret word when describer rotates to another player', async () => {
    await renderAndConnect(App);
    const firstTurnStart = new Date().toISOString();

    sendServerMessage({
      action: 'describeWord',
      word: 'origin',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [
          fixtures.player(),
          { name: 'Lucky Noodle 75', connectionId: 'other-conn', score: 0 },
        ],
        currentRound: 1,
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        turnStartTime: firstTurnStart,
        timeLimit: 120,
      },
    });

    await waitFor(() => expect(screen.getByText('origin')).toBeInTheDocument());
    expect(screen.getByText(/You're describing/)).toBeInTheDocument();

    sendServerMessage({
      action: 'turnStarted',
      hint: '_ _ _ _ _',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [
          fixtures.player(),
          { name: 'Lucky Noodle 75', connectionId: 'other-conn', score: 0 },
        ],
        currentRound: 1,
        currentDescriberIndex: 1,
        turnState: 'DESCRIBING',
        turnStartTime: new Date(Date.now() + 1000).toISOString(),
        timeLimit: 120,
      },
    });

    await waitFor(() => {
      expect(screen.queryByText('origin')).not.toBeInTheDocument();
      expect(screen.getByText(/Lucky Noodle 75 is now describing/)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText('Type your guess...')).toBeInTheDocument();
  });

  test('a repeated turnStarted does not stack multiple countdown intervals', async () => {
    vi.useFakeTimers();

    render(<App />);

    act(() => {
      vi.runOnlyPendingTimers();
    });

    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const game = {
      gameId: 'GAME123',
      gameState: 'IN_PROGRESS',
      players: [
        { name: 'Player1', connectionId: 'conn-1', score: 0 },
        { name: 'TestPlayer', connectionId: 'test-conn', score: 0 },
      ],
      currentRound: 1,
      currentDescriberIndex: 0,
      turnState: 'DESCRIBING',
      turnStartTime: new Date().toISOString(),
      timeLimit: 120,
    };

    sendServerMessages(
      { action: 'turnStarted', hint: '_ _ _ _ _', game },
      { action: 'turnStarted', hint: '_ _ _ _ _', game }
    );

    expect(screen.getByText('02:00')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(screen.getByText('01:59')).toBeInTheDocument();

    vi.useRealTimers();
  });

  test('hintUpdated outside an active game does not break the lobby render', async () => {
    await renderAndConnect(App);
    sendServerMessage({ action: 'hintUpdated', hint: 'E _ _ P _ _ _ _' });
    expect(screen.getByText(/Create New Game/)).toBeInTheDocument();
  });

  test('replaying an emoji from the quickbar sends it again', async () => {
    const { container } = await renderAndConnect(App);
    describerTurn();
    sendServerMessage({ action: 'newEmoji', emoji: '🐘' });

    await waitFor(() => expect(container.querySelector('.emoji-key')).toBeInTheDocument());
    fireEvent.click(container.querySelector('.emoji-key')!);

    expect(sentMessages()).toContainEqual({
      action: 'submitEmoji',
      gameId: 'GAME123',
      emoji: '🐘',
    });
  });

  test('the describer can clear the emoji they have played', async () => {
    await renderAndConnect(App);
    describerTurn();
    sendServerMessage({ action: 'newEmoji', emoji: '🐘' });

    await waitFor(() => expect(screen.getByText('Clear all')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Clear all'));

    expect(sentMessages()).toContainEqual({ action: 'clearEmojis', gameId: 'GAME123' });
    await waitFor(() => expect(screen.getByText('Waiting for emojis...')).toBeInTheDocument());
  });

  test('emojisCleared wipes the canvas', async () => {
    await renderAndConnect(App);
    sendServerMessages(
      fixtures.gameStarted({ currentDescriberIndex: 0 }),
      { action: 'newEmoji', emoji: '🎉' },
    );

    await waitFor(() => expect(screen.getByText(/🎉/)).toBeInTheDocument());

    sendServerMessage({ action: 'emojisCleared' });

    await waitFor(() => expect(screen.getByText('Waiting for emojis...')).toBeInTheDocument());
  });

  test('playerJoined mid-game adds the player and restarts the round timer', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'playerJoined',
      game: {
        gameId: 'GAME123',
        gameState: 'IN_PROGRESS',
        players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
        ownerId: fixtures.TEST_CONN,
        currentRound: 1,
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        turnStartTime: new Date().toISOString(),
        timeLimit: 120,
      },
    });

    await waitFor(() => expect(screen.getByText('2 players')).toBeInTheDocument());
    expect(screen.getByText('02:00')).toBeInTheDocument();
  });

  test('playerReconnected refreshes the roster', async () => {
    await renderAndConnect(App);
    sendServerMessage({
      action: 'playerReconnected',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
        ownerId: fixtures.TEST_CONN,
      },
    });

    await waitFor(() => expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument());
  });

  test('a message with no game drops back to the lobby instead of throwing', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameCreated());
    await waitFor(() => expect(screen.getByText('🎯 Game Lobby')).toBeInTheDocument());

    sendServerMessage({ action: 'playerNameUpdated' });

    await waitFor(() => expect(screen.getByText(/Create New Game/)).toBeInTheDocument());
  });

  test('an empty or markup-only guess is never sent', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted({
      currentDescriberIndex: 0,
      players: [fixtures.player(), { name: 'Player2', connectionId: 'conn-2', score: 0 }],
    }));

    await waitFor(() => expect(screen.getByPlaceholderText('Type your guess...')).toBeInTheDocument());
    const input = screen.getByPlaceholderText('Type your guess...');
    const form = input.closest('form')!;

    fireEvent.submit(form);
    fireEvent.change(input, { target: { value: '<b></b>' } });
    fireEvent.submit(form);

    expect(mockSend).not.toHaveBeenCalledWith(expect.stringContaining('submitGuess'));
  });

  test('a repeated event id is applied only once', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted({ currentDescriberIndex: 0 }));

    const guess = { action: 'newGuess', text: 'Player2: apple', eventId: 'evt-1' };
    sendServerMessages(guess, guess);

    await waitFor(() => expect(screen.getAllByText('Player2: apple')).toHaveLength(1));
  });

  test('the seen-event list is trimmed rather than growing without bound', async () => {
    await renderAndConnect(App);
    sendServerMessage(fixtures.gameStarted({ currentDescriberIndex: 0 }));

    const guesses = Array.from({ length: 205 }, (_, index) => ({
      action: 'newGuess',
      text: `Player2: guess${index}`,
      eventId: `evt-${index}`,
    }));
    sendServerMessages(...guesses);

    await waitFor(() => expect(screen.getByText('Player2: guess204')).toBeInTheDocument());

    // The oldest id has been evicted, so its message is accepted a second time.
    sendServerMessage(guesses[0]);
    await waitFor(() => expect(screen.getAllByText('Player2: guess0')).toHaveLength(2));
  });
});
