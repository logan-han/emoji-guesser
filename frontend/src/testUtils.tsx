import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';

export const mockWebSocketInstances: any[] = [];
export const mockSend = vi.fn();
export const mockAlert = vi.fn();

const createStorageMock = () => ({
  getItem: vi.fn(),
  setItem: vi.fn(),
  clear: vi.fn(),
  removeItem: vi.fn(),
});

export const localStorageMock = createStorageMock();
export const sessionStorageMock = createStorageMock();

export class MockWebSocket {
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readyState = (global as any).WebSocket?.OPEN ?? 1;
  url = '';
  send = mockSend;
  close = vi.fn();

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

export const installBrowserMocks = () => {
  global.localStorage = localStorageMock as any;
  global.sessionStorage = sessionStorageMock as any;
  global.alert = mockAlert;
  global.WebSocket = MockWebSocket as any;
};

export const resetTestMocks = () => {
  vi.clearAllMocks();
  mockWebSocketInstances.length = 0;
  localStorageMock.getItem.mockReturnValue(null);
  sessionStorageMock.getItem.mockReturnValue(null);
  window.history.pushState = vi.fn();
  mockAlert.mockClear();
};

export const renderAndConnect = async (AppComponent: React.ComponentType) => {
  const result = render(<AppComponent />);
  await waitFor(() => {
    expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
  });
  return result;
};

export const sendServerMessage = (payload: any) => {
  const ws = mockWebSocketInstances[0];
  act(() => {
    ws.onmessage({ data: JSON.stringify(payload) });
  });
};

export const sendServerMessages = (...payloads: any[]) => {
  const ws = mockWebSocketInstances[0];
  act(() => {
    payloads.forEach((payload) => {
      ws.onmessage({ data: JSON.stringify(payload) });
    });
  });
};

const TEST_CONN = 'test-conn';

const basePlayer = (overrides: Record<string, any> = {}) => ({
  name: 'TestPlayer',
  connectionId: TEST_CONN,
  score: 0,
  ...overrides,
});

export const fixtures = {
  TEST_CONN,
  player: basePlayer,
  gameCreated: (overrides: Record<string, any> = {}) => ({
    action: 'gameCreated',
    game: {
      gameId: 'GAME123',
      gameState: 'WAITING',
      players: [basePlayer()],
      ownerId: TEST_CONN,
      ...overrides,
    },
  }),
  gameStarted: (overrides: Record<string, any> = {}) => ({
    action: 'gameStarted',
    game: {
      gameId: 'GAME123',
      gameState: 'IN_PROGRESS',
      players: [basePlayer()],
      ownerId: TEST_CONN,
      currentRound: 1,
      ...overrides,
    },
  }),
  gameEnded: (overrides: Record<string, any> = {}) => ({
    action: 'gameEnded',
    game: {
      gameId: 'GAME123',
      gameState: 'ENDED',
      players: [basePlayer({ score: 100 })],
      ownerId: TEST_CONN,
      ...overrides,
    },
  }),
};
