import { APIGatewayEvent } from 'aws-lambda';
import { connect, disconnect, default_handler, listPublicGames, cleanupGames } from './websockets';

// Runs before the hoisted imports so websockets.ts reads the test table name at load.
const {
  asCommand,
  mockDbSend,
  mockPublishGameEvent,
  mockGetCommand,
  mockPutCommand,
  mockUpdateCommand,
  mockDeleteCommand,
  mockScanCommand,
  mockApgSend,
  mockPostToConnectionCommand,
} = vi.hoisted(() => {
  process.env.SUPABASE_GAMES_TABLE = 'test-games-table';
  // Command mocks are called with new, so they need a real function rather than an arrow.
  const asCommand = function (input: any) { return { input }; };
  return {
    asCommand,
    // Supabase store mocks
    mockDbSend: vi.fn().mockResolvedValue({}),
    mockPublishGameEvent: vi.fn().mockResolvedValue(undefined),
    mockGetCommand: vi.fn(asCommand),
    mockPutCommand: vi.fn(asCommand),
    mockUpdateCommand: vi.fn(asCommand),
    mockDeleteCommand: vi.fn(asCommand),
    mockScanCommand: vi.fn(asCommand),
    // ApiGateway mocks
    mockApgSend: vi.fn().mockResolvedValue({}),
    mockPostToConnectionCommand: vi.fn(asCommand),
  };
});

// Mock dictionary
vi.mock('./dictionary', () => ({
  getRandomWords: vi.fn().mockResolvedValue(['apple', 'banana', 'orange']),
  generateHint: vi.fn().mockReturnValue('_ _ _ _ _'),
}));

vi.mock('./supabaseStore', () => ({
  gameStore: { send: mockDbSend },
  publishGameEvent: mockPublishGameEvent,
  GetCommand: mockGetCommand,
  PutCommand: mockPutCommand,
  UpdateCommand: mockUpdateCommand,
  DeleteCommand: mockDeleteCommand,
  ScanCommand: mockScanCommand,
}));

vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: vi.fn(function () { return { send: mockApgSend }; }),
  PostToConnectionCommand: mockPostToConnectionCommand,
}));

const expectRealtimeAction = (action: string) => {
  expect(mockPublishGameEvent).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({ action })
  );
};

vi.useFakeTimers();

describe('WebSocket Handler Tests', () => {
  const mockEvent: Partial<APIGatewayEvent> = {
    requestContext: {
      connectionId: 'test-connection-123',
      domainName: 'test-domain.com',
      stage: 'test'
    } as any,
    body: null
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_GAMES_TABLE = 'test-games-table';
    mockDbSend.mockResolvedValue({});
    mockPublishGameEvent.mockResolvedValue(undefined);
    mockApgSend.mockResolvedValue({});
    mockGetCommand.mockImplementation(asCommand);
    mockPutCommand.mockImplementation(asCommand);
    mockUpdateCommand.mockImplementation(asCommand);
    mockDeleteCommand.mockImplementation(asCommand);
    mockScanCommand.mockImplementation(asCommand);
    mockPostToConnectionCommand.mockImplementation(asCommand);
  });

  describe('Connect Handler', () => {
    test('handles new connection successfully', async () => {
      const result = await connect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected'
      });
      expect(mockPostToConnectionCommand).not.toHaveBeenCalled();
    });
  });

  describe('Disconnect Handler', () => {
    test('handles disconnection and removes player from game', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
          { connectionId: 'test-connection-456', name: 'Player 2' },
        ]
      };
      mockDbSend.mockResolvedValueOnce({ Items: [game] });

      const result = await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected'
      });
      expect(mockScanCommand).toHaveBeenCalled();
      expect(mockUpdateCommand).toHaveBeenCalledWith({
        TableName: 'test-games-table',
        Key: { gameId: 'game-1' },
        UpdateExpression: 'set players = :p, ownerId = :o',
        ExpressionAttributeValues: {
          ':p': [{ connectionId: 'test-connection-456', name: 'Player 2' }],
          ':o': 'test-connection-456'
        }
      });
    });

    test('handles describer disconnection in an active game', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-789', name: 'Player 3', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0
      };
      mockDbSend.mockResolvedValueOnce({ Items: [game] });

      await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expectRealtimeAction('playerLeft');
    });

    test('deletes the game if the last player disconnects', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
      };
      mockDbSend.mockResolvedValueOnce({ Items: [game] });

      await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).toHaveBeenCalledWith({ TableName: 'test-games-table', Key: { gameId: 'game-1' } });
    });

    test('handles non-describer disconnection in an active game', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-789', name: 'Player 3', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0
      };
      mockDbSend.mockResolvedValueOnce({ Items: [game] });

      const event = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'test-connection-456' },
      };

      await disconnect(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expectRealtimeAction('playerLeft');
    });

    test('ends the game if a player disconnects and there are not enough players', async () => {
        const game = {
          gameId: 'game-1',
          ownerId: 'test-connection-123',
          players: [
            { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
            { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
          ],
          gameState: 'IN_PROGRESS',
          currentDescriberIndex: 0
        };
        mockDbSend.mockResolvedValueOnce({ Items: [game] });

        await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

        expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
          ExpressionAttributeValues: expect.objectContaining({
            ':s': 'ENDED'
          })
        }));
        expectRealtimeAction('gameEnded');
      });
  });

  describe('Message Handler', () => {
    test('handles createGame action', async () => {
      const createGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'createGame',
          playerName: 'Test Player'
        })
      };

      const result = await default_handler(createGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
      expect(mockPutCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalled();
    });

    test('handles createGame failure', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const createGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'createGame',
          playerName: 'Test Player'
        })
      };

      await default_handler(createGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({ action: 'error', message: 'Could not create game.' })
      });
    });

    test('handles joinGame action', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [{ connectionId: 'owner-123', name: 'Owner' }],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player'
        })
      };

      const result = await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
      expect(mockGetCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: expect.stringContaining('"action":"playerJoined"')
      });
      expect(mockPublishGameEvent).toHaveBeenCalledWith(
        'existing-game',
        expect.objectContaining({ action: 'playerJoined' })
      );
    });

    test('handles player rejoining a waiting game', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [{ connectionId: 'owner-123', name: 'Owner', sessionId: 'session-1' }],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player',
          sessionId: 'session-1'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('playerJoined')
      }));
    });

    test('handles joinGame with non-existent game', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'non-existent-game',
          playerName: 'Test Player'
        })
      };

      const result = await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({ action: 'error', message: 'Game not found.' })
      });
    });

    test('should not allow a player to join a game in progress', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [{ connectionId: 'owner-123', name: 'Owner', lastSeen: new Date().toISOString() }],
        gameState: 'IN_PROGRESS'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('spectatorJoined')
      }));
    });

    test('handles player rejoining an in-progress game', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [
          { connectionId: 'owner-123', name: 'Owner', sessionId: 'session-1' },
          { connectionId: 'other-player', name: 'Player 2', sessionId: 'session-2' }
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        secretWord: 'apple',
        currentHint: '_ _ _ _ _'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection-id' },
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player',
          sessionId: 'session-2'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expectRealtimeAction('playerReconnected');
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        ConnectionId: 'new-connection-id',
        Data: expect.stringContaining('hintUpdated')
      }));
    });

    test('handles joinGame failure', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({ action: 'error', message: 'Could not join game.' })
      });
    });

    test('handles heartbeat action', async () => {
      const heartbeatEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'heartbeat',
          sessionId: 'test-session-123'
        })
      };

      const result = await default_handler(heartbeatEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
    });

    test('should handle heartbeat failure', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const heartbeatEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'heartbeat',
          sessionId: 'test-session-123'
        })
      };

      await expect(default_handler(heartbeatEvent as APIGatewayEvent, {} as any, {} as any)).resolves.not.toThrow();
    });

    test('should handle updatePlayerName for non-existent player', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'non-existent-connection' },
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: 'New Name' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Player not found in game.')
      }));
    });

    test('should handle updatePlayerName failure', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: 'New Name' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Could not update name.')
      }));
    });

    test('should handle timeUp for non-existent game', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'timeUp', gameId: 'non-existent-game' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).not.toHaveBeenCalled();
    });

    test('should not end round if not in DESCRIBING state', async () => {
      const game = {
        gameId: 'game-1',
        turnState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'timeUp', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalled();
    });

    test('should not allow non-owner to restart game', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'owner-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
        gameState: 'ENDED'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameRestarted')
      }));
    });

    test('should not allow restarting a game that has not ended', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Can only restart ended games.')
      }));
    });

    test('should handle restartGame failure', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
        gameState: 'ENDED'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Could not restart game.')
      }));
    });

    test('handles unknown action', async () => {
      const unknownEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'unknownAction',
          data: 'test'
        })
      };

      const result = await default_handler(unknownEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
    });

    test('handles invalid JSON with error response', async () => {
      const eventWithBody = {
        ...mockEvent,
        body: 'invalid json'
      };

      const result = await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 400,
        body: 'Invalid JSON format.'
      });
    });

    test('handles missing body with error response', async () => {
      const result = await default_handler(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 400,
        body: 'Invalid request'
      });
    });
  });

  describe('listPublicGames Handler', () => {
    test('should return a list of public games', async () => {
      const games = [
        { gameId: 'game-1', isPublic: true, gameState: 'WAITING' },
        { gameId: 'game-2', isPublic: true, gameState: 'WAITING' },
      ];
      mockDbSend.mockResolvedValueOnce({ Items: games });

      const result = await listPublicGames(mockEvent as APIGatewayEvent, {} as any, {} as any) as { statusCode: number, body: string };

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(games);
      expect(mockScanCommand).toHaveBeenCalledWith({
        TableName: 'test-games-table',
        FilterExpression: 'isPublic = :true and gameState = :waiting',
        ExpressionAttributeValues: {
          ':true': true,
          ':waiting': 'WAITING',
        },
      });
    });

    test('should handle errors when listing public games', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const result = await listPublicGames(mockEvent as APIGatewayEvent, {} as any, {} as any) as { statusCode: number, body: string };

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toEqual({ message: 'Could not list public games.' });
    });
  });

  describe('submitEmoji', () => {
    test('should broadcast emoji to all players', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
          { connectionId: 'test-connection-456', name: 'Player 2' },
        ],
        spectators: [{ connectionId: 'spectator-1' }]
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitEmoji', gameId: 'game-1', emoji: '👍' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPublishGameEvent).toHaveBeenCalledWith(
        'game-1',
        expect.objectContaining({ action: 'newEmoji', emoji: '👍', eventId: expect.any(String) })
      );
    });

    test('should handle submitEmoji failure', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitEmoji', gameId: 'game-1', emoji: '👍' })
      };

      await expect(default_handler(event as APIGatewayEvent, {} as any, {} as any)).resolves.not.toThrow();
    });
  });

  describe('startGame', () => {
    test('should start the game if the owner requests it', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Attributes: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledTimes(2);
      expectRealtimeAction('gameStarted');
    });

    test('should not start the game if a non-owner requests it', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'another-player',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Attributes: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledTimes(1);
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Only the owner can start the game')
      }));
    });

    test('should not start the game with fewer than 2 players', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Attributes: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledTimes(1);
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('You need at least 2 ready players to start')
      }));
    });

    test('should handle startGame failure', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Could not start game.')
      }));
    });
  });

  describe('chooseWord', () => {
    test('should allow the describer to choose a word', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        wordOptions: ['apple', 'banana', 'orange']
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({ ':w': 'apple' })
      }));
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('describeWord')
      }));
    });

    test('should not allow the describer to choose an invalid word', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        wordOptions: ['apple', 'banana', 'orange']
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'grape' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Invalid word choice')
      }));
    });

    test('should handle chooseWord failure', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        wordOptions: ['apple', 'banana', 'orange']
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });
      mockDbSend.mockRejectedValueOnce(new Error('Database error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Could not choose word.')
      }));
    });

    test('should handle correct guesses', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', score: 0, lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', score: 0, lastSeen: new Date().toISOString() },
        ],
        secretWord: 'apple',
        currentDescriberIndex: 0,
        turnStartTime: new Date().toISOString(),
        maxRounds: 2,
        currentRound: 1
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'test-connection-456' },
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1', guess: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expectRealtimeAction('wordGuessed');
    });
  });

  describe('default_handler invalid actions', () => {
    test('handles invalid action', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'invalidAction' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Unknown action: invalidAction')
      }));
    });

    test('handles missing gameId', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'joinGame' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId is required for joinGame action.')
      }));
    });

    test('handles missing word for chooseWord', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId and word are required for chooseWord action.')
      }));
    });

    test('handles missing guess for submitGuess', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId and guess are required for submitGuess action.')
      }));
    });

    test('handles missing emoji for submitEmoji', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitEmoji', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId and emoji are required for submitEmoji action.')
      }));
    });

    test('handles missing gameId for timeUp', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'timeUp' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId is required for timeUp action.')
      }));
    });

    test('handles missing gameId for restartGame', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId is required for restartGame action.')
      }));
    });

    test('handles missing name for updatePlayerName', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId and name are required for updatePlayerName action.')
      }));
    });
  });

  describe('Coverage Specific Tests', () => {
    test('should handle stale connection on sendMessageToClient', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockApgSend.mockRejectedValueOnce({ statusCode: 410 });

        const event = {
          ...mockEvent,
          body: JSON.stringify({ action: 'createGame', playerName: 'Test Player' })
        };

        await default_handler(event as APIGatewayEvent, {} as any, {} as any);

        // No error should be thrown, and console.error should not be called for 410 errors
        expect(consoleErrorSpy).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

    test('should handle AWS SDK v3 stale connection errors', async () => {
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        mockApgSend.mockRejectedValueOnce({ $metadata: { httpStatusCode: 410 } });

        const event = {
          ...mockEvent,
          body: JSON.stringify({ action: 'createGame', playerName: 'Test Player' })
        };

        await default_handler(event as APIGatewayEvent, {} as any, {} as any);

        expect(consoleErrorSpy).not.toHaveBeenCalled();
        consoleErrorSpy.mockRestore();
      });

      test('should cleanup stale players and reassign owner', async () => {
        const now = new Date().getTime();
        const staleTime = 3 * 60 * 1000; // 3 minutes ago
        const game = {
          gameId: 'game-1',
          ownerId: 'stale-player',
          players: [
            { connectionId: 'stale-player', name: 'Stale Player', lastSeen: new Date(now - staleTime).toISOString() },
            { connectionId: 'active-player', name: 'Active Player', lastSeen: new Date().toISOString() },
          ],
          gameState: 'WAITING'
        };
        mockDbSend.mockResolvedValueOnce({ Attributes: game });

        const event = {
          ...mockEvent,
          body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
        };

        await default_handler(event as APIGatewayEvent, {} as any, {} as any);

        expect(mockUpdateCommand).toHaveBeenCalledTimes(2);
      });

      test('should update hint and handle premature timeUp', async () => {
        const game = {
            gameId: 'game-1',
            players: [
              { connectionId: 'test-connection-123', name: 'Player 1' },
              { connectionId: 'test-connection-456', name: 'Player 2' },
            ],
            gameState: 'IN_PROGRESS',
            turnState: 'DESCRIBING',
            secretWord: 'apple',
            currentDescriberIndex: 0,
            timeLimit: 60,
            turnStartTime: new Date(Date.now() - 58 * 1000).toISOString(), // 2 seconds left
          };
          mockDbSend.mockResolvedValue({ Item: game });

          const event = {
            ...mockEvent,
            body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' })
          };

          await default_handler(event as APIGatewayEvent, {} as any, {} as any);

          expectRealtimeAction('timeUp');
      });
  });

  describe('submitGuess', () => {
    test('should not allow describer to guess their own word', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', score: 0 },
          { connectionId: 'test-connection-456', name: 'Player 2', score: 0 },
        ],
        secretWord: 'apple',
        currentDescriberIndex: 0, // test-connection-123 is describer
        turnStartTime: new Date().toISOString()
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1', guess: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      // Should not broadcast word guessed because describer tried to guess
      expect(mockPostToConnectionCommand).not.toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('wordGuessed')
      }));
    });

    test('should handle incorrect guess', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', score: 0 },
          { connectionId: 'test-connection-456', name: 'Player 2', score: 0 },
        ],
        secretWord: 'apple',
        currentDescriberIndex: 1, // test-connection-456 is describer
        turnStartTime: new Date().toISOString()
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1', guess: 'banana' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expectRealtimeAction('newGuess');
    });

    test('should handle non-existent player guess', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'other-connection', name: 'Player 1', score: 0 },
        ],
        secretWord: 'apple',
        currentDescriberIndex: 0
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1', guess: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      // Should not broadcast anything since player is not in game
      expect(mockPostToConnectionCommand).not.toHaveBeenCalled();
    });
  });

  describe('updatePlayerName', () => {
    test('should update player name by sessionId', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'other-connection', name: 'Player 1', sessionId: 'test-session-123', lastSeen: new Date().toISOString() },
        ]
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection' },
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: 'New Name', sessionId: 'test-session-123' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expectRealtimeAction('playerNameUpdated');
    });

    test('should handle non-existent game', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'non-existent', name: 'New Name' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Game not found')
      }));
    });
  });

  describe('heartbeat', () => {
    test('should update player lastSeen by sessionId', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'other-connection', name: 'Player 1', sessionId: 'test-session-123' },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Items: [game] });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'heartbeat', sessionId: 'test-session-123' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('heartbeatAck')
      }));
    });

    test('should handle heartbeat with specific gameId', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'heartbeat', sessionId: 'test-session-123', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockGetCommand).toHaveBeenCalledWith({ TableName: 'test-games-table', Key: { gameId: 'game-1' } });
    });
  });

  describe('restartGame', () => {
    test('should allow non-owner to rejoin ended game', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'other-owner',
        ownerSessionId: 'other-session',
        players: [
          { connectionId: 'other-owner', name: 'Owner', sessionId: 'other-session', lastSeen: new Date().toISOString() },
          { connectionId: 'old-connection', name: 'Player 2', sessionId: 'test-session-123', lastSeen: new Date().toISOString() },
        ],
        gameState: 'ENDED'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1', sessionId: 'test-session-123' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalled();
      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameRestarted')
      }));
    });

    test('should not allow non-player to rejoin', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'other-owner',
        players: [
          { connectionId: 'other-owner', name: 'Owner', sessionId: 'other-session', lastSeen: new Date().toISOString() },
        ],
        gameState: 'ENDED'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1', sessionId: 'not-in-game-session' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('You were not in this game')
      }));
    });

    test('should not allow restart of non-ended game for non-owner', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'other-owner',
        players: [
          { connectionId: 'other-owner', name: 'Owner', lastSeen: new Date().toISOString() },
        ],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Only the owner can restart')
      }));
    });

    test('should handle non-existent game', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'non-existent' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Game not found')
      }));
    });

    test('should convert spectators to players on restart', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        ownerSessionId: 'test-session',
        players: [
          { connectionId: 'test-connection-123', name: 'Owner', sessionId: 'test-session', lastSeen: new Date().toISOString() },
        ],
        spectators: [
          { connectionId: 'spec-1', name: 'Spectator 1', lastSeen: new Date().toISOString() }
        ],
        gameState: 'ENDED'
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'restartGame', gameId: 'game-1', sessionId: 'test-session' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ':p': expect.arrayContaining([
            expect.objectContaining({ name: 'Owner' }),
            expect.objectContaining({ name: 'Spectator 1' })
          ])
        })
      }));
    });
  });

  describe('joinGame', () => {
    test('should update owner connectionId when owner rejoins', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'old-connection',
        ownerSessionId: 'session-1',
        players: [{ connectionId: 'old-connection', name: 'Owner', sessionId: 'session-1' }],
        gameState: 'WAITING'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection' },
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Owner',
          sessionId: 'session-1'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ':o': 'new-connection'
        })
      }));
    });

    test('should send hint to reconnecting non-describer', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [
          { connectionId: 'owner-123', name: 'Owner', sessionId: 'session-1' },
          { connectionId: 'old-player', name: 'Player 2', sessionId: 'session-2' }
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        secretWord: 'apple',
        currentHint: 'A _ _ _ _'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection-for-p2' },
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          sessionId: 'session-2'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        ConnectionId: 'new-connection-for-p2',
        Data: expect.stringContaining('hintUpdated')
      }));
    });

    test('should send word to reconnecting describer in choosing word state', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        ownerSessionId: 'session-1',
        players: [
          { connectionId: 'old-owner', name: 'Owner', sessionId: 'session-1' },
          { connectionId: 'player-2', name: 'Player 2', sessionId: 'session-2' }
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        turnState: 'CHOOSING_WORD',
        wordOptions: ['apple', 'banana', 'orange']
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection' },
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          sessionId: 'session-1'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        ConnectionId: 'new-connection',
        Data: expect.stringContaining('chooseWord')
      }));
    });

    test('should send secret word to reconnecting describer in describing state', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        ownerSessionId: 'session-1',
        players: [
          { connectionId: 'old-owner', name: 'Owner', sessionId: 'session-1' },
          { connectionId: 'player-2', name: 'Player 2', sessionId: 'session-2' }
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0,
        turnState: 'DESCRIBING',
        secretWord: 'elephant'
      };
      mockDbSend.mockResolvedValueOnce({ Item: existingGame });

      const joinGameEvent = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'new-connection' },
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          sessionId: 'session-1'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        ConnectionId: 'new-connection',
        Data: expect.stringContaining('describeWord')
      }));
    });
  });

  describe('updateHint', () => {
    test('should not update hint when game not in DESCRIBING state', async () => {
      const game = {
        gameId: 'game-1',
        turnState: 'CHOOSING_WORD',
        secretWord: 'apple',
        turnStartTime: new Date().toISOString()
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalled();
    });

    test('should not update hint when no secret word', async () => {
      const game = {
        gameId: 'game-1',
        turnState: 'DESCRIBING',
        turnStartTime: new Date().toISOString()
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalled();
    });

    test('should force end round when very close to timeout', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
          { connectionId: 'test-connection-456', name: 'Player 2' },
        ],
        gameState: 'IN_PROGRESS',
        turnState: 'DESCRIBING',
        secretWord: 'apple',
        currentDescriberIndex: 0,
        timeLimit: 60,
        turnStartTime: new Date(Date.now() - 59 * 1000).toISOString(), // 1 second left
        currentRound: 1,
        maxRounds: 2
      };
      mockDbSend.mockResolvedValue({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expectRealtimeAction('timeUp');
    });
  });

  describe('chooseWord edge cases', () => {
    test('should not allow non-describer to choose word', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
          { connectionId: 'test-connection-456', name: 'Player 2' },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 1, // test-connection-456 is describer
        wordOptions: ['apple', 'banana', 'orange']
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('not the current describer')
      }));
    });

    test('should handle missing wordOptions', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1' },
        ],
        gameState: 'IN_PROGRESS',
        currentDescriberIndex: 0
        // No wordOptions
      };
      mockDbSend.mockResolvedValueOnce({ Item: game });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Invalid word choice')
      }));
    });
  });

  describe('disconnect edge cases', () => {
    test('should handle disconnect when player not in any game', async () => {
      mockDbSend.mockResolvedValueOnce({ Items: [] });

      const result = await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({ statusCode: 200, body: 'Disconnected' });
    });

    test('should handle disconnect error gracefully', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockDbSend.mockRejectedValueOnce(new Error('DB Error'));

      const result = await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({ statusCode: 200, body: 'Disconnected' });
      expect(consoleErrorSpy).toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });
  });

  describe('listPublicGames via WebSocket', () => {
    test('should send public games list through WebSocket', async () => {
      const games = [
        { gameId: 'game-1', isPublic: true, gameState: 'WAITING', players: [] },
      ];
      mockDbSend.mockResolvedValueOnce({ Items: games });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'listPublicGames' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('publicGamesList')
      }));
    });

    test('should handle error when listing public games via WebSocket', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('DB Error'));

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'listPublicGames' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('error')
      }));
    });
  });

  describe('cleanupGames Handler', () => {
    const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
    const minutesAgo = (m: number) => new Date(Date.now() - m * 60 * 1000).toISOString();

    const activePlayer = () => ({ connectionId: 'c-1', name: 'P1', lastSeen: minutesAgo(1) });
    const stalePlayer = () => ({ connectionId: 'c-1', name: 'P1', lastSeen: minutesAgo(30) });

    test('reports back when the scan returns no items', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const result = await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({ statusCode: 200, body: 'No games to process.' });
      expect(mockDeleteCommand).not.toHaveBeenCalled();
    });

    test('deletes games that have no players left', async () => {
      mockDbSend.mockResolvedValueOnce({
        Items: [{ gameId: 'empty', players: [], gameState: 'WAITING', updatedAt: minutesAgo(1) }],
      });

      const result = await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: { gameId: 'empty' } })
      );
      expect(result).toEqual({ statusCode: 200, body: 'Cleanup complete.' });
    });

    test.each(['WAITING', 'ENDED'])('deletes stale %s games older than two hours', async (gameState) => {
      mockDbSend.mockResolvedValueOnce({
        Items: [{ gameId: 'stale', players: [activePlayer()], gameState, updatedAt: hoursAgo(3) }],
      });

      await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: { gameId: 'stale' } })
      );
    });

    test('keeps recent WAITING games that still have players', async () => {
      mockDbSend.mockResolvedValueOnce({
        Items: [{ gameId: 'fresh', players: [activePlayer()], gameState: 'WAITING', updatedAt: minutesAgo(1) }],
      });

      await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).not.toHaveBeenCalled();
    });

    test('deletes in-progress games where no player was seen in the last five minutes', async () => {
      mockDbSend.mockResolvedValueOnce({
        Items: [{ gameId: 'abandoned', players: [stalePlayer()], gameState: 'IN_PROGRESS', updatedAt: minutesAgo(10) }],
      });

      await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).toHaveBeenCalledWith(
        expect.objectContaining({ Key: { gameId: 'abandoned' } })
      );
    });

    test('keeps in-progress games while at least one player is still active', async () => {
      mockDbSend.mockResolvedValueOnce({
        Items: [{
          gameId: 'live',
          players: [stalePlayer(), activePlayer()],
          gameState: 'IN_PROGRESS',
          updatedAt: minutesAgo(10),
        }],
      });

      await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDeleteCommand).not.toHaveBeenCalled();
    });

    test('returns 500 when the scan fails', async () => {
      mockDbSend.mockRejectedValueOnce(new Error('Scan failed'));

      const result = await cleanupGames(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({ statusCode: 500, body: 'Error during cleanup.' });
    });
  });

  describe('clearEmojis Action', () => {
    test('broadcasts emojisCleared to players and spectators', async () => {
      mockDbSend.mockResolvedValueOnce({
        Item: {
          gameId: 'game-1',
          players: [{ connectionId: 'c-1' }, { connectionId: 'c-2' }],
          spectators: [{ connectionId: 's-1' }],
        },
      });

      const event = { ...mockEvent, body: JSON.stringify({ action: 'clearEmojis', gameId: 'game-1' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('emojisCleared'),
      }));
      expect(mockPostToConnectionCommand).toHaveBeenCalledTimes(3);
    });

    test('rejects the action when gameId is missing', async () => {
      const event = { ...mockEvent, body: JSON.stringify({ action: 'clearEmojis' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId is required for clearEmojis action.'),
      }));
    });

    test('stays quiet when the game no longer exists', async () => {
      mockDbSend.mockResolvedValueOnce({});

      const event = { ...mockEvent, body: JSON.stringify({ action: 'clearEmojis', gameId: 'missing' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).not.toHaveBeenCalled();
    });
  });

  describe('updateHint Action', () => {
    const describingGame = (overrides: Record<string, any> = {}) => ({
      gameId: 'game-1',
      turnState: 'DESCRIBING',
      secretWord: 'apple',
      turnStartTime: new Date(Date.now() - 5000).toISOString(),
      timeLimit: 60,
      currentDescriberIndex: 0,
      players: [{ connectionId: 'describer' }, { connectionId: 'guesser' }],
      spectators: [{ connectionId: 'spectator' }],
      ...overrides,
    });

    test('rejects the action when gameId is missing', async () => {
      const event = { ...mockEvent, body: JSON.stringify({ action: 'updateHint' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameId is required for updateHint action.'),
      }));
    });

    test('ignores games that are not currently being described', async () => {
      mockDbSend.mockResolvedValueOnce({ Item: describingGame({ turnState: 'CHOOSING' }) });

      const event = { ...mockEvent, body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalled();
      expect(mockPostToConnectionCommand).not.toHaveBeenCalled();
    });

    test('sends the refreshed hint to guessers and spectators but not the describer', async () => {
      mockDbSend.mockResolvedValueOnce({ Item: describingGame() });

      const event = { ...mockEvent, body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        UpdateExpression: 'set currentHint = :h',
      }));
      const targets = mockPostToConnectionCommand.mock.calls.map((call) => call[0].ConnectionId);
      expect(targets).toEqual(expect.arrayContaining(['guesser', 'spectator']));
      expect(targets).not.toContain('describer');
    });

    test('ends the round instead of hinting once the time limit has passed', async () => {
      mockDbSend.mockResolvedValueOnce({
        Item: describingGame({ turnStartTime: new Date(Date.now() - 61000).toISOString() }),
      });

      const event = { ...mockEvent, body: JSON.stringify({ action: 'updateHint', gameId: 'game-1' }) };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).not.toHaveBeenCalledWith(expect.objectContaining({
        UpdateExpression: 'set currentHint = :h',
      }));
    });
  });

  describe('Player Name Sanitisation', () => {
    const gameWithPlayer = {
      gameId: 'game-1',
      players: [{ connectionId: 'test-connection-123', name: 'Old', sessionId: 'sess-1' }],
    };

    test('strips HTML tags from a submitted name', async () => {
      mockDbSend.mockResolvedValueOnce({ Item: JSON.parse(JSON.stringify(gameWithPlayer)) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: '<script>x</script>Bob' }),
      };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: { ':p': [expect.objectContaining({ name: 'xBob' })] },
      }));
    });

    test('truncates names longer than twenty characters', async () => {
      mockDbSend.mockResolvedValueOnce({ Item: JSON.parse(JSON.stringify(gameWithPlayer)) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: 'A'.repeat(40) }),
      };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdateCommand).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: { ':p': [expect.objectContaining({ name: 'A'.repeat(20) })] },
      }));
    });

    test('rejects a name that is only markup', async () => {
      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'updatePlayerName', gameId: 'game-1', name: '<b></b>' }),
      };
      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnectionCommand).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Player name is required.'),
      }));
      expect(mockUpdateCommand).not.toHaveBeenCalled();
    });
  });
});
