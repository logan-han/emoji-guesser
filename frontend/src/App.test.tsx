
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import App from './App';

// Mock sounds
jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

const createStorageMock = () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn(),
});

// Mock browser storage
const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();
global.localStorage = localStorageMock as any;
global.sessionStorage = sessionStorageMock as any;

// Mock window.alert
const mockAlert = jest.fn();
global.alert = mockAlert;

// Mock WebSocket
const mockWebSocketInstances: any[] = [];
const mockSend = jest.fn();

class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = WebSocket.OPEN;
  url = '';
  send = mockSend;
  close = jest.fn();

  constructor(url: string) {
    this.url = url;
    mockWebSocketInstances.push(this);
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }
}

global.WebSocket = MockWebSocket as any;

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWebSocketInstances.length = 0;
    localStorageMock.getItem.mockReturnValue(null);
    sessionStorageMock.getItem.mockReturnValue(null);
    window.history.pushState = jest.fn();
    mockAlert.mockClear();
  });

  test('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('🎮 Emoji Guesser')).toBeInTheDocument();
  });

  test('displays connection status', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/Status:/)).toBeInTheDocument();
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });
  });

  test('handles game creation', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'TestPlayer' } });
    const createButton = screen.getByText('Create New Game');
    fireEvent.click(createButton);
    
    // Check that WebSocket send was called
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalled();
    });
  });

  test('handles game creation message', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];
    
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{
              name: 'TestPlayer',
              connectionId: 'test-conn',
              score: 0
            }],
            ownerId: 'test-conn'
          }
        })
      });
    });
    
    await waitFor(() => {
      expect(screen.getByText('🎯 Game Lobby')).toBeInTheDocument();
      expect(screen.getByText('GAME123')).toBeInTheDocument();
    });
  });

  test('handles game started message', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];
    
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{
              name: 'TestPlayer',
              connectionId: 'test-conn',
              score: 0
            }],
            ownerId: 'test-conn',
            currentRound: 1
          }
        })
      });
    });
    
    await waitFor(() => {
      expect(screen.getByText(/Game started!/)).toBeInTheDocument();
    });
  });

  test('handles choose word message', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];
    
    // This should not throw an error
    expect(() => {
      act(() => {
        websocket.onmessage({
          data: JSON.stringify({
            action: 'chooseWord',
            wordOptions: ['cat', 'dog', 'bird']
          })
        });
      });
    }).not.toThrow();
  });

  test('handles error messages', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'error',
          message: 'Something went wrong'
        })
      });
    });

    // Check for error notification instead of alert
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Something went wrong/)).toBeInTheDocument();
    });
  });

  test('handles WebSocket disconnection', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];
    
    act(() => {
      websocket.onclose(new CloseEvent('close'));
    });
    
    await waitFor(() => {
      expect(screen.getByText(/🔴 Disconnected/)).toBeInTheDocument();
    });
  });

  test('handles WebSocket error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const websocket = mockWebSocketInstances[0];
    
    act(() => {
      websocket.onerror(new Event('error'));
    });
    
    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket error:', expect.any(Event));
    });
    
    consoleSpy.mockRestore();
  });

  test('handles game join by ID', async () => {
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });

    const gameIdInput = screen.getByPlaceholderText('Enter Game ID');
    fireEvent.change(screen.getByLabelText('Your name'), { target: { value: 'TestPlayer' } });
    fireEvent.change(gameIdInput, { target: { value: 'GAME123' } });
    
    const joinButton = screen.getByText('Join Game');
    fireEvent.click(joinButton);
    
    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(
        expect.stringContaining('joinGame')
      );
    });
  });

  test('allows player to change their name', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn'
          }
        })
      });
    });

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

  test('describer can choose a word', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameStarted', game: { gameId: 'GAME123', gameState: 'IN_PROGRESS', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }], ownerId: 'test-conn', currentRound: 1 } }) });
      websocket.onmessage({ data: JSON.stringify({ action: 'chooseWord', wordOptions: ['cat', 'dog', 'bird'] }) });
    });

    await waitFor(() => expect(screen.getByText(/Choose a Word to Describe/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('cat'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('chooseWord'));
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('cat'));
    });
  });

  test('guesser can submit a guess', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameStarted', game: { gameId: 'GAME123', gameState: 'IN_PROGRESS', players: [{ name: 'TestPlayer', connectionId: 'other-conn', score: 0 }, { name: 'Me', connectionId: 'test-conn', score: 0 }], ownerId: 'other-conn', currentDescriberIndex: 0, turnState: 'DESCRIBING', currentHint: '_ _ _' } }) });
    });

    await waitFor(() => expect(screen.getByPlaceholderText('Type your guess...')).toBeInTheDocument());

    const guessInput = screen.getByPlaceholderText('Type your guess...');
    fireEvent.change(guessInput, { target: { value: 'dog' } });
    fireEvent.click(screen.getByText('Guess'));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('submitGuess'));
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('dog'));
    });
  });

  test('displays final scores when game ends', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameEnded', game: { gameId: 'GAME123', gameState: 'ENDED', players: [{ name: 'Lucky Noodle 75', connectionId: 'test-conn', score: 100 }] } }) });
    });

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());
    expect(screen.getAllByText('Lucky Noodle 75').length).toBeGreaterThan(0);
    expect(screen.getByText('100 pts')).toBeInTheDocument();
  });

  test('allows the owner to play again', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameEnded', game: { gameId: 'GAME123', gameState: 'ENDED', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 100, wantsToPlayAgain: false }], ownerId: 'test-conn' } }) });
    });

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());

    fireEvent.click(screen.getByText(/Play Again|Rejoin Game/));

    await waitFor(() => {
      expect(mockSend).toHaveBeenCalledWith(expect.stringContaining('restartGame'));
    });
  });

  test('allows the user to go back to the lobby', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameEnded', game: { gameId: 'GAME123', gameState: 'ENDED', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 100, wantsToPlayAgain: false }], ownerId: 'test-conn' } }) });
    });

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Back to Lobby'));

    await waitFor(() => {
      expect(screen.getByText('Create New Game')).toBeInTheDocument();
    });
  });

  test('can select public or private game', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const privateRadio = screen.getByLabelText('Private Game');
    const publicRadio = screen.getByLabelText('Public Game');

    expect(privateRadio).toBeChecked();
    expect(publicRadio).not.toBeChecked();

    fireEvent.click(publicRadio);

    expect(publicRadio).toBeChecked();
    expect(privateRadio).not.toBeChecked();
  });

  test('displays and copies the invite link', async () => {
    Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });

    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameCreated', game: { gameId: 'GAME123', gameState: 'WAITING', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }], ownerId: 'test-conn' } }) });
    });

    await waitFor(() => expect(screen.getByText('Invite Link:')).toBeInTheDocument());

    const copyButton = screen.getByText('📋 Copy');
    fireEvent.click(copyButton);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost/?gameId=GAME123');
    await waitFor(() => expect(screen.getByText('✅ Copied!')).toBeInTheDocument());
  });

  test('handles spectator join', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'spectatorJoined',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'Player1', connectionId: 'conn-1', score: 50 },
              { name: 'Player2', connectionId: 'conn-2', score: 30 }
            ],
            ownerId: 'conn-1',
            currentRound: 1,
            currentDescriberIndex: 0
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Spectator Mode/)).toBeInTheDocument();
    });
  });

  test('handles new emoji message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    // First, get into a game
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1,
            currentDescriberIndex: 0
          }
        })
      });
    });

    // Then receive an emoji
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'newEmoji',
          emoji: '🎉'
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/🎉/)).toBeInTheDocument();
    });
  });

  test('handles new guess message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1,
            currentDescriberIndex: 0
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'newGuess',
          text: 'Player2: apple'
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Player2: apple')).toBeInTheDocument();
    });
  });

  test('handles word guessed correctly', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'wordGuessed',
          guesserName: 'Player2',
          word: 'elephant',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'TestPlayer', connectionId: 'test-conn', score: 75 },
              { name: 'Player2', connectionId: 'conn-2', score: 100 }
            ],
            ownerId: 'test-conn',
            currentRound: 1
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Player2 guessed correctly/)).toBeInTheDocument();
      expect(screen.getByText(/elephant/)).toBeInTheDocument();
    });
  });

  test('handles next turn message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1,
            maxRounds: 2
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'nextTurn',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1,
            maxRounds: 2,
            currentDescriberIndex: 1
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Round 1 of 2/)).toBeInTheDocument();
    });
  });

  test('handles time up message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'timeUp',
          message: "⏰ Time's up!",
          word: 'secret'
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Time's up/)).toBeInTheDocument();
      expect(screen.getByText(/secret/)).toBeInTheDocument();
    });
  });

  test('handles player left message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 },
              { name: 'Player2', connectionId: 'conn-2', score: 0 }
            ],
            ownerId: 'test-conn'
          }
        })
      });
    });

    // Wait for game lobby to appear
    await waitFor(() => expect(screen.getByText(/Game Lobby/)).toBeInTheDocument());

    // Initially 2 players
    expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument();

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'playerLeft',
          message: 'Player2 left the game',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn'
          }
        })
      });
    });

    // Should now only have 1 player
    await waitFor(() => {
      expect(screen.getByText(/Players \(1\)/)).toBeInTheDocument();
    });
  });

  test('handles game restarted message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameRestarted',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn'
          },
          message: '🔄 Game restarted!'
        })
      });
    });

    // Game should be back in WAITING/lobby state
    await waitFor(() => {
      expect(screen.getByText(/Game Lobby/)).toBeInTheDocument();
      expect(screen.getByText('GAME123')).toBeInTheDocument();
    });
  });

  test('handles heartbeat acknowledgement with hint', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'heartbeatAck',
          currentHint: '_ _ _ _'
        })
      });
    });

    // Heartbeat ack should not cause any visible changes unless in a game
    expect(screen.getByText(/Create New Game/)).toBeInTheDocument();
  });

  test('handles public games list', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'publicGamesList',
          games: [
            {
              gameId: 'PUBLIC1',
              gameState: 'WAITING',
              players: [{ name: 'Host', connectionId: 'host-conn', score: 0 }]
            }
          ]
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('#PUBLIC1')).toBeInTheDocument();
    });
  });

  test('handles describe word message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 }
            ],
            ownerId: 'test-conn',
            currentRound: 1,
            currentDescriberIndex: 0,
            turnState: 'CHOOSING_WORD'
          }
        })
      });
    });

    // Wait for game in progress
    await waitFor(() => expect(screen.getByText(/Game in Progress/)).toBeInTheDocument());

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'describeWord',
          word: 'elephant',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            currentRound: 1,
            currentDescriberIndex: 0,
            turnState: 'DESCRIBING',
            turnStartTime: new Date().toISOString(),
            timeLimit: 120
          }
        })
      });
    });

    await waitFor(() => {
      // Verify the word is shown somewhere and the describer view is active
      expect(screen.getByText('elephant')).toBeInTheDocument();
    });
  });

  test('handles turn started message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'Player1', connectionId: 'conn-1', score: 0 },
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 }
            ],
            ownerId: 'conn-1',
            currentRound: 1,
            currentDescriberIndex: 0
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'turnStarted',
          hint: '_ _ _ _ _',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [
              { name: 'Player1', connectionId: 'conn-1', score: 0 },
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 }
            ],
            currentRound: 1,
            currentDescriberIndex: 0,
            turnState: 'DESCRIBING',
            turnStartTime: new Date().toISOString(),
            timeLimit: 120
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Player1 is now describing/)).toBeInTheDocument();
    });
  });

  test('does not stack round timer intervals when the same turn is refreshed', async () => {
    jest.useFakeTimers();

    render(<App />);

    act(() => {
      jest.runOnlyPendingTimers();
    });

    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    const game = {
      gameId: 'GAME123',
      gameState: 'IN_PROGRESS',
      players: [
        { name: 'Player1', connectionId: 'conn-1', score: 0 },
        { name: 'TestPlayer', connectionId: 'test-conn', score: 0 }
      ],
      currentRound: 1,
      currentDescriberIndex: 0,
      turnState: 'DESCRIBING',
      turnStartTime: new Date().toISOString(),
      timeLimit: 120
    };

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'turnStarted',
          hint: '_ _ _ _ _',
          game
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'turnStarted',
          hint: '_ _ _ _ _',
          game
        })
      });
    });

    expect(screen.getByText('02:00')).toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText('01:59')).toBeInTheDocument();

    jest.useRealTimers();
  });

  test('handles hint updated message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'hintUpdated',
          hint: 'E _ _ P _ _ _ _'
        })
      });
    });

    // Since we're not in a game, this shouldn't show anything visible
    // but it tests the message handler path
    expect(screen.getByText(/Create New Game/)).toBeInTheDocument();
  });

  test('handles status message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameStarted',
          game: {
            gameId: 'GAME123',
            gameState: 'IN_PROGRESS',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            currentRound: 1
          }
        })
      });
      websocket.onmessage({
        data: JSON.stringify({
          action: 'statusMessage',
          message: 'Player1 is choosing a word...',
          timestamp: Date.now()
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Player1 is choosing a word...')).toBeInTheDocument();
    });
  });

  test('handles player rejoined message', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn'
          }
        })
      });
    });

    await waitFor(() => expect(screen.getByText(/Game Lobby/)).toBeInTheDocument());

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'playerRejoined',
          rejoinedPlayer: 'Player2',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 },
              { name: 'Player2', connectionId: 'conn-2', score: 0 }
            ],
            ownerId: 'test-conn'
          }
        })
      });
    });

    // Player count should increase
    await waitFor(() => {
      expect(screen.getByText(/Players \(2\)/)).toBeInTheDocument();
    });
  });

  test('displays spectators in game lobby', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn',
            spectators: [{ name: 'Spectator1', connectionId: 'spec-1' }]
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Spectators (1)')).toBeInTheDocument();
      expect(screen.getByText('Spectator1')).toBeInTheDocument();
    });
  });

  test('loads saved session from sessionStorage', async () => {
    // Access the original mock from beforeEach
    const sessionData: Record<string, string> = {
      'emoji-guesser-session': 'saved-session-123',
    };
    const localData: Record<string, string> = {
      'emoji-guesser-player-name': 'SavedPlayerName'
    };

    Object.defineProperty(window, 'sessionStorage', {
      value: {
        getItem: jest.fn((key: string) => sessionData[key] || null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      },
      writable: true,
    });

    Object.defineProperty(window, 'localStorage', {
      value: {
        getItem: jest.fn((key: string) => localData[key] || null),
        setItem: jest.fn(),
        removeItem: jest.fn(),
        clear: jest.fn(),
        key: jest.fn(),
        length: 0,
      },
      writable: true,
    });

    render(<App />);

    // The app should render and attempt to use localStorage
    await waitFor(() => expect(screen.getByText(/Emoji Guesser/)).toBeInTheDocument());
  });

  test('handles connected message', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'connected',
          connectionId: 'new-conn-123'
        })
      });
    });

    // The connectionId should be stored internally
    consoleSpy.mockRestore();
  });

  test('handles unknown message type', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'unknownAction',
          data: 'some data'
        })
      });
    });

    expect(consoleSpy).toHaveBeenCalledWith('Unknown message:', expect.objectContaining({ action: 'unknownAction' }));
    consoleSpy.mockRestore();
  });

  test('shows start game button when owner has 2+ players', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0, wantsToPlayAgain: true },
              { name: 'Player2', connectionId: 'conn-2', score: 0, wantsToPlayAgain: true }
            ],
            ownerId: 'test-conn'
          }
        })
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/Start Game/)).toBeInTheDocument();
    });
  });

  test('handles game restarted with isNewOwner flag', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];

    // First create a game as another player
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameCreated',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [
              { name: 'OriginalOwner', connectionId: 'original-owner', score: 0 },
              { name: 'TestPlayer', connectionId: 'test-conn', score: 0 }
            ],
            ownerId: 'original-owner'
          }
        })
      });
    });

    await waitFor(() => expect(screen.getByText('TestPlayer')).toBeInTheDocument());

    // Now restart the game with isNewOwner flag
    act(() => {
      websocket.onmessage({
        data: JSON.stringify({
          action: 'gameRestarted',
          game: {
            gameId: 'GAME123',
            gameState: 'WAITING',
            players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }],
            ownerId: 'test-conn'
          },
          isNewOwner: true
        })
      });
    });

    // The test player should now be the owner (shown with crown)
    await waitFor(() => {
      expect(screen.getByTitle('Game Host')).toBeInTheDocument();
    });
  });

  test('clipboard copy failure is handled gracefully', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    Object.assign(navigator, {
      clipboard: {
        writeText: jest.fn().mockRejectedValue(new Error('Copy failed'))
      }
    });

    render(<App />);
    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const websocket = mockWebSocketInstances[0];
    act(() => {
      websocket.onmessage({ data: JSON.stringify({ action: 'gameCreated', game: { gameId: 'GAME123', gameState: 'WAITING', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 0 }], ownerId: 'test-conn' } }) });
    });

    await waitFor(() => expect(screen.getByText('📋 Copy')).toBeInTheDocument());

    fireEvent.click(screen.getByText('📋 Copy'));

    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith('Failed to copy:', expect.any(Error));
    });

    consoleErrorSpy.mockRestore();
  });
});
