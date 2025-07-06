import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import App from './App';

// Mock the playSound function
jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

// Create a proper WebSocket class mock
class MockWebSocket {
  public onopen: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public readyState: number = WebSocket.CONNECTING;
  public url: string;
  public protocol: string = '';
  public extensions: string = '';
  public bufferedAmount: number = 0;
  public binaryType: BinaryType = 'blob';

  public static CONNECTING = 0;
  public static OPEN = 1;
  public static CLOSING = 2;
  public static CLOSED = 3;

  public send = jest.fn();
  public close = jest.fn();
  public addEventListener = jest.fn();
  public removeEventListener = jest.fn();
  public dispatchEvent = jest.fn();

  constructor(url: string) {
    this.url = url;
    // Store reference for testing
    currentWebSocketInstance = this;
  }
}

// Store reference to the current instance for testing
let currentWebSocketInstance: MockWebSocket | null = null;

// Mock the global WebSocket
global.WebSocket = MockWebSocket as any;

// Mock environment variables
process.env.REACT_APP_WS_URL = 'ws://localhost:3001';

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock as any;

// Helper function to simulate WebSocket connection
const simulateWebSocketConnection = () => {
  act(() => {
    if (currentWebSocketInstance && currentWebSocketInstance.onopen) {
      currentWebSocketInstance.readyState = MockWebSocket.OPEN;
      currentWebSocketInstance.onopen(new Event('open'));
    }
  });
};

// Helper function to simulate WebSocket message
const simulateWebSocketMessage = (data: any) => {
  act(() => {
    if (currentWebSocketInstance && currentWebSocketInstance.onmessage) {
      const event = new MessageEvent('message', { data: JSON.stringify(data) });
      currentWebSocketInstance.onmessage(event);
    }
  });
};

describe('App Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
    currentWebSocketInstance = null;
  });

  test('renders emoji guesser title', () => {
    render(<App />);
    const titleElement = screen.getByText(/emoji guesser/i);
    expect(titleElement).toBeInTheDocument();
  });

  test('renders create game button when not connected to a game', () => {
    render(<App />);
    const createButton = screen.getByText(/create new game/i);
    expect(createButton).toBeInTheDocument();
  });

  test('renders connection status', () => {
    render(<App />);
    const statusElement = screen.getByText(/status:/i);
    expect(statusElement).toBeInTheDocument();
  });

  test('shows disconnected status initially', () => {
    render(<App />);
    const disconnectedStatus = screen.getByText(/disconnected/i);
    expect(disconnectedStatus).toBeInTheDocument();
  });

  test('create game button is disabled when disconnected', () => {
    render(<App />);
    const createButton = screen.getByText(/create new game/i);
    expect(createButton).toBeDisabled();
  });

  test('join game button is disabled when no game ID is entered', () => {
    render(<App />);
    const joinButton = screen.getByText(/join game/i);
    expect(joinButton).toBeDisabled();
  });

  test('handles basic component rendering without WebSocket issues', async () => {
    render(<App />);
    
    // Wait for any initial setup to complete
    await waitFor(() => {
      expect(screen.getByText(/emoji guesser/i)).toBeInTheDocument();
    });
    
    // Check that basic UI elements are present
    expect(screen.getByText(/create new game/i)).toBeInTheDocument();
    expect(screen.getByText(/join game/i)).toBeInTheDocument();
  });

  test('enables create game button when connected', async () => {
    render(<App />);
    
    // Simulate WebSocket connection
    simulateWebSocketConnection();
    
    await waitFor(() => {
      const createButton = screen.getByText(/create new game/i);
      expect(createButton).not.toBeDisabled();
    });
  });

  test('shows connected status when WebSocket connects', async () => {
    render(<App />);
    
    // Simulate WebSocket connection
    simulateWebSocketConnection();
    
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
  });

  test('handles game creation', async () => {
    render(<App />);
    
    // Simulate WebSocket connection
    simulateWebSocketConnection();
    
    // Wait for connection and then click create game
    await waitFor(() => {
      const createButton = screen.getByText(/create new game/i);
      expect(createButton).not.toBeDisabled();
    });
    
    const createButton = screen.getByText(/create new game/i);
    fireEvent.click(createButton);
    
    // Check that send was called with create game action
    expect(currentWebSocketInstance?.send).toHaveBeenCalledWith(
      expect.stringContaining('createGame')
    );
  });

  test('handles game join with game ID', async () => {
    render(<App />);
    
    // Simulate WebSocket connection
    simulateWebSocketConnection();
    
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
    
    // Enter a game ID
    const gameIdInput = screen.getByPlaceholderText(/enter game id/i);
    fireEvent.change(gameIdInput, { target: { value: 'TEST123' } });
    
    // Join game button should now be enabled
    const joinButton = screen.getByText(/join game/i);
    expect(joinButton).not.toBeDisabled();
    
    fireEvent.click(joinButton);
    
    // Check that send was called with join game action
    expect(currentWebSocketInstance?.send).toHaveBeenCalledWith(
      expect.stringContaining('joinGame')
    );
  });

  test('handles incoming game created message', async () => {
    render(<App />);
    
    simulateWebSocketConnection();
    
    // Simulate receiving game created message with proper structure
    simulateWebSocketMessage({
      action: 'gameCreated',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [],
        ownerId: 'owner123'
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/game lobby/i)).toBeInTheDocument();
    });
    
    // Verify the game ID is displayed
    expect(screen.getAllByText(/GAME123/)).toHaveLength(2); // Game ID and invite link
  });

  test('handles player name input in game', async () => {
    render(<App />);
    
    simulateWebSocketConnection();
    
    // First create a game to show the player interface
    simulateWebSocketMessage({
      action: 'gameCreated',
      game: {
        gameId: 'GAME123',
        gameState: 'WAITING',
        players: [{ name: 'TestPlayer', connectionId: 'test-conn' }],
        ownerId: 'test-conn'
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/game lobby/i)).toBeInTheDocument();
    });
    
    // Look for the player name display and click to edit
    const playerNameDisplay = screen.getByText(/TestPlayer/);
    fireEvent.click(playerNameDisplay);
    
    // Now the name input should be visible
    const nameInput = screen.getByPlaceholderText(/enter your name/i);
    fireEvent.change(nameInput, { target: { value: 'NewPlayerName' } });
    
    expect(nameInput).toHaveValue('NewPlayerName');
  });

  test('handles WebSocket close event', async () => {
    render(<App />);
    
    // Connect first
    simulateWebSocketConnection();
    
    await waitFor(() => {
      expect(screen.getByText(/connected/i)).toBeInTheDocument();
    });
    
    // Simulate close event
    act(() => {
      if (currentWebSocketInstance && currentWebSocketInstance.onclose) {
        currentWebSocketInstance.readyState = MockWebSocket.CLOSED;
        const closeEvent = new CloseEvent('close');
        currentWebSocketInstance.onclose(closeEvent);
      }
    });
    
    await waitFor(() => {
      expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
    });
  });

  test('handles WebSocket error event', async () => {
    render(<App />);
    
    // Simulate error event
    act(() => {
      if (currentWebSocketInstance && currentWebSocketInstance.onerror) {
        currentWebSocketInstance.onerror(new Event('error'));
      }
    });
    
    // Should show disconnected status
    expect(screen.getByText(/disconnected/i)).toBeInTheDocument();
  });
});