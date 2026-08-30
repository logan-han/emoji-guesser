import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import App from './App';
import {
  installBrowserMocks,
  resetTestMocks,
  renderAndConnect,
  sendServerMessage,
  fixtures,
} from './testUtils';

jest.mock('./sounds', () => ({
  playSound: jest.fn(),
}));

// react-scripts sets `resetMocks: true`, which strips implementations from
// jest.fn() before every test, so the Supabase stub is built from plain
// functions and records into this object instead.
// `var` avoids the temporal dead zone: jest hoists the factory above this file.
var mockRealtime: {
  handlers: Record<string, (payload: any) => void>;
  subscribed: number;
  removed: number;
};

jest.mock('./supabase', () => {
  const channel: any = {
    on: (_type: string, filter: { event: string }, handler: (payload: any) => void) => {
      mockRealtime.handlers[filter.event] = handler;
      return channel;
    },
    subscribe: () => {
      mockRealtime.subscribed += 1;
      return channel;
    },
  };
  return {
    supabase: {
      channel: () => channel,
      removeChannel: () => {
        mockRealtime.removed += 1;
      },
    },
  };
});

mockRealtime = { handlers: {}, subscribed: 0, removed: 0 };

installBrowserMocks();

const emitGameStatus = (game: any) => {
  act(() => {
    mockRealtime.handlers['game_status']({ payload: game });
  });
};

const inProgressGame = (overrides: Record<string, any> = {}) => ({
  gameId: 'GAME123',
  gameState: 'IN_PROGRESS',
  turnState: 'DESCRIBING',
  players: [fixtures.player()],
  ownerId: fixtures.TEST_CONN,
  currentRound: 2,
  timeLimit: 60,
  turnStartTime: new Date().toISOString(),
  ...overrides,
});

const connectAndCreateGame = async () => {
  await renderAndConnect(App);
  sendServerMessage(fixtures.gameCreated());
  await waitFor(() => {
    expect(mockRealtime.handlers['game_status']).toBeDefined();
  });
};

describe('App - Supabase realtime channel', () => {
  beforeEach(() => {
    resetTestMocks();
    mockRealtime.handlers = {};
    mockRealtime.subscribed = 0;
    mockRealtime.removed = 0;
  });

  test('subscribes to the game channel once a game exists', async () => {
    await connectAndCreateGame();

    expect(mockRealtime.subscribed).toBe(1);
    expect(mockRealtime.handlers['game_event']).toBeDefined();
  });

  test('applies a game_status broadcast to the rendered state', async () => {
    await connectAndCreateGame();

    emitGameStatus(inProgressGame({ currentHint: '_ p p _ e' }));

    // The hint rail renders one element per character, so assert on the container.
    await waitFor(() => {
      expect(screen.getByLabelText('Word hint')).toHaveTextContent('_pp_e');
    });
  });

  test('ignores a broadcast for a different game', async () => {
    await connectAndCreateGame();

    emitGameStatus(inProgressGame({ gameId: 'OTHER', currentHint: 'zzz' }));

    expect(screen.queryByLabelText('Word hint')).not.toBeInTheDocument();
  });

  test('ignores an empty broadcast payload', async () => {
    await connectAndCreateGame();

    expect(() => emitGameStatus(undefined)).not.toThrow();
  });

  test('clears the hint when a broadcast reports the game has ended', async () => {
    await connectAndCreateGame();

    emitGameStatus(inProgressGame({ currentHint: '_ p p _ e' }));
    await waitFor(() => expect(screen.getByLabelText('Word hint')).toHaveTextContent('_pp_e'));

    emitGameStatus({
      gameId: 'GAME123',
      gameState: 'ENDED',
      players: [fixtures.player({ score: 30 })],
      ownerId: fixtures.TEST_CONN,
    });

    await waitFor(() => {
      expect(screen.queryByLabelText('Word hint')).not.toBeInTheDocument();
    });
  });

  test('routes a game_event broadcast through the normal message handler', async () => {
    await connectAndCreateGame();

    act(() => {
      mockRealtime.handlers['game_event']({
        payload: { action: 'error', message: 'realtime failure' },
      });
    });

    await waitFor(() => {
      expect(screen.getByText(/realtime failure/)).toBeInTheDocument();
    });
  });
});
