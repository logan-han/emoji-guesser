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
  sessionStorageMock,
} from './testUtils';

vi.mock('./sounds', () => ({
  playSound: vi.fn(),
}));

installBrowserMocks();

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const closeSocket = (index = 0) => {
  act(() => {
    mockWebSocketInstances[index].onclose(new CloseEvent('close'));
  });
};

describe('App - session identity', () => {
  const realCrypto = globalThis.crypto;

  beforeEach(resetTestMocks);

  afterEach(() => {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: realCrypto });
  });

  test('stores a new session id on first load', async () => {
    await renderAndConnect(App);

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      'emoji-guesser-session',
      expect.stringMatching(UUID_SHAPE),
    );
  });

  test('falls back to getRandomValues where randomUUID is missing', async () => {
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      writable: true,
      value: { getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab) },
    });

    await renderAndConnect(App);

    expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
      'emoji-guesser-session',
      expect.stringMatching(UUID_SHAPE),
    );
  });

  test('refuses to start without a secure random source', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Object.defineProperty(globalThis, 'crypto', { configurable: true, writable: true, value: undefined });

    expect(() => render(<App />)).toThrow('Secure random number generation is unavailable');

    consoleErrorSpy.mockRestore();
  });
});

describe('App - joining from a shared link', () => {
  beforeEach(() => {
    resetTestMocks();
    window.history.replaceState({}, '', '/?gameId=SHARED1');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('pre-fills the pending game and joins it as soon as the socket opens', async () => {
    render(<App />);

    // The banner only stands until the socket opens and the join is sent.
    expect(screen.getByText('Joining game SHARED1')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter Game ID')).toHaveValue('SHARED1');

    await waitFor(() => expect(screen.getByText(/🟢 Connected/)).toBeInTheDocument());

    const joinMessage = mockSend.mock.calls
      .map(([payload]) => JSON.parse(payload as string))
      .find(message => message.action === 'joinGame');
    expect(joinMessage).toMatchObject({ action: 'joinGame', gameId: 'SHARED1' });
    expect(joinMessage.playerName).toEqual(expect.any(String));
  });
});

describe('App - reconnection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTestMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('opens a fresh socket after the backoff delay', async () => {
    await renderAndConnect(App);
    expect(mockWebSocketInstances).toHaveLength(1);

    closeSocket();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(mockWebSocketInstances.length).toBeGreaterThan(1);
  });

  test('gives up after five attempts and offers a manual reconnect', async () => {
    await renderAndConnect(App);

    // Closing without letting the socket reopen keeps the attempt counter climbing.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      closeSocket();
    }

    await waitFor(() => {
      expect(screen.getByText('Connection lost. Please refresh the page to reconnect.')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Reconnect'));

    await waitFor(() => expect(mockWebSocketInstances.length).toBeGreaterThan(1));
  });

  test('dismissing the error banner hides it', async () => {
    await renderAndConnect(App);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      closeSocket();
    }

    await waitFor(() => expect(screen.getByLabelText('Dismiss error')).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText('Dismiss error'));

    expect(screen.queryByText('Connection lost. Please refresh the page to reconnect.')).not.toBeInTheDocument();
  });
});
