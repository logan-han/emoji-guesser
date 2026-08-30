import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  mockWebSocketInstances,
  renderAndConnect,
  sendServerMessage,
  fixtures,
} from './testUtils';

jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

installBrowserMocks();

describe('App - lifecycle and connection', () => {
  beforeEach(resetTestMocks);

  test('renders without crashing', () => {
    render(<App />);
    expect(screen.getByText('🎮 Emoji Guesser')).toBeInTheDocument();
  });

  test('displays connection status when WebSocket opens', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Status:/)).toBeInTheDocument();
      expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument();
    });
  });

  test('shows Disconnected after onclose fires', async () => {
    await renderAndConnect(App);
    const ws = mockWebSocketInstances[0];

    act(() => {
      ws.onclose(new CloseEvent('close'));
    });

    await waitFor(() => {
      expect(screen.getByText(/🔴 Disconnected/)).toBeInTheDocument();
    });
  });

  test('logs and surfaces WebSocket onerror', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    await renderAndConnect(App);
    const ws = mockWebSocketInstances[0];

    act(() => {
      ws.onerror(new Event('error'));
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('WebSocket error:', expect.any(Event));
    });

    consoleSpy.mockRestore();
  });

  test('renders with values persisted in sessionStorage and localStorage', async () => {
    const sessionData: Record<string, string> = {
      'emoji-guesser-session': 'saved-session-123',
    };
    const localData: Record<string, string> = {
      'emoji-guesser-player-name': 'SavedPlayerName',
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

    await waitFor(() => expect(screen.getByText(/Emoji Guesser/)).toBeInTheDocument());
  });

  test('accepts the "connected" server message without crashing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await renderAndConnect(App);

    sendServerMessage({ action: 'connected', connectionId: 'new-conn-123' });

    consoleSpy.mockRestore();
  });

  test('logs unknown action types instead of throwing', async () => {
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
    await renderAndConnect(App);

    sendServerMessage({ action: 'unknownAction', data: 'some data' });

    expect(consoleSpy).toHaveBeenCalledWith(
      'Unknown message:',
      expect.objectContaining({ action: 'unknownAction' })
    );
    consoleSpy.mockRestore();
  });

  test('renders a server-driven status message during a game', async () => {
    await renderAndConnect(App);

    act(() => {
      const ws = mockWebSocketInstances[0];
      ws.onmessage({ data: JSON.stringify(fixtures.gameStarted()) });
      ws.onmessage({
        data: JSON.stringify({
          action: 'statusMessage',
          message: 'Player1 is choosing a word...',
          timestamp: Date.now(),
        }),
      });
    });

    await waitFor(() => {
      expect(screen.getByText('Player1 is choosing a word...')).toBeInTheDocument();
    });
  });
});
