import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';
import App from './App';

// Mock sounds
jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  clear: jest.fn(),
  removeItem: jest.fn(),
};
global.localStorage = localStorageMock as any;

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
    
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith('Error: Something went wrong');
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
      websocket.onmessage({ data: JSON.stringify({ action: 'gameEnded', game: { gameId: 'GAME123', gameState: 'ENDED', players: [{ name: 'TestPlayer', connectionId: 'test-conn', score: 100 }] } }) });
    });

    await waitFor(() => expect(screen.getByText('Final Scores:')).toBeInTheDocument());
    expect(screen.getByText('TestPlayer')).toBeInTheDocument();
    expect(screen.getByText('100')).toBeInTheDocument();
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
});
