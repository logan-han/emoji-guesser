// Set environment variables for testing before importing modules
process.env.GAMES_TABLE = 'test-games-table';

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-123456')
}));

// Mock dictionary
jest.mock('./dictionary', () => ({
  getRandomWords: jest.fn().mockResolvedValue(['apple', 'banana', 'orange']),
  generateHint: jest.fn().mockReturnValue('_ _ _ _ _'),
}));

const mockPut = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockUpdate = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockGet = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockDelete = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });
const mockScan = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({ Items: [] }) });
const mockPostToConnection = jest.fn().mockReturnValue({ promise: jest.fn().mockResolvedValue({}) });

// Mock AWS SDK
jest.mock('aws-sdk', () => ({
  DynamoDB: {
    DocumentClient: jest.fn(() => ({
      get: mockGet,
      put: mockPut,
      update: mockUpdate,
      delete: mockDelete,
      scan: mockScan,
    }))
  },
  ApiGatewayManagementApi: jest.fn(() => ({
    postToConnection: mockPostToConnection,
  }))
}));

import { APIGatewayEvent } from 'aws-lambda';
import { connect, disconnect, default_handler, listPublicGames } from './websockets';

jest.useFakeTimers();

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
    jest.clearAllMocks();
    process.env.GAMES_TABLE = 'test-games-table';
  });

  describe('Connect Handler', () => {
    test('handles new connection successfully', async () => {
      const result = await connect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected'
      });
      expect(mockPostToConnection).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({ action: 'connected', connectionId: 'test-connection-123' })
      });
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
      mockScan.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Items: [game] }) });

      const result = await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected'
      });
      expect(mockScan).toHaveBeenCalled();
      expect(mockUpdate).toHaveBeenCalledWith({
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
      mockScan.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Items: [game] }) });

      await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('playerLeft')
      }));
    });

    test('deletes the game if the last player disconnects', async () => {
      const game = {
        gameId: 'game-1',
        ownerId: 'test-connection-123',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
        ],
      };
      mockScan.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Items: [game] }) });

      await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockDelete).toHaveBeenCalledWith({ TableName: 'test-games-table', Key: { gameId: 'game-1' } });
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
      expect(mockPut).toHaveBeenCalled();
      expect(mockPostToConnection).toHaveBeenCalled();
    });

    test('handles joinGame action', async () => {
      const existingGame = {
        gameId: 'existing-game',
        ownerId: 'owner-123',
        players: [{ connectionId: 'owner-123', name: 'Owner' }],
        gameState: 'WAITING'
      };
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: existingGame }) });

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
      expect(mockGet).toHaveBeenCalled();
    });

    test('handles joinGame with non-existent game', async () => {
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({}) });

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
      expect(mockPostToConnection).toHaveBeenCalledWith({
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
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: existingGame }) });

      const joinGameEvent = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'existing-game',
          playerName: 'Test Player'
        })
      };

      await default_handler(joinGameEvent as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('spectatorJoined')
      }));
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
      mockScan.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Items: games }) });

      const result = await listPublicGames(mockEvent as APIGatewayEvent, {} as any, {} as any) as { statusCode: number, body: string };

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual(games);
      expect(mockScan).toHaveBeenCalledWith({
        TableName: 'test-games-table',
        FilterExpression: 'isPublic = :true and gameState = :waiting',
        ExpressionAttributeValues: {
          ':true': true,
          ':waiting': 'WAITING',
        },
      });
    });

    test('should handle errors when listing public games', async () => {
      mockScan.mockReturnValueOnce({ promise: jest.fn().mockRejectedValue(new Error('DynamoDB error')) });

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
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: game }) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'submitEmoji', gameId: 'game-1', emoji: '👍' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnection).toHaveBeenCalledTimes(3);
      expect(mockPostToConnection).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({ action: 'newEmoji', emoji: '👍' })
      });
      expect(mockPostToConnection).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-456',
        Data: JSON.stringify({ action: 'newEmoji', emoji: '👍' })
      });
      expect(mockPostToConnection).toHaveBeenCalledWith({
        ConnectionId: 'spectator-1',
        Data: JSON.stringify({ action: 'newEmoji', emoji: '👍' })
      });
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
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: game }) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('gameStarted')
      }));
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
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: game }) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'startGame', gameId: 'game-1' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('Only the owner can start the game')
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
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: game }) });

      const event = {
        ...mockEvent,
        body: JSON.stringify({ action: 'chooseWord', gameId: 'game-1', word: 'apple' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({ ':w': 'apple' })
      }));
      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('describeWord')
      }));
    });
  });

  describe('submitGuess', () => {
    test('should handle incorrect guesses', async () => {
      const game = {
        gameId: 'game-1',
        players: [
          { connectionId: 'test-connection-123', name: 'Player 1', lastSeen: new Date().toISOString() },
          { connectionId: 'test-connection-456', name: 'Player 2', lastSeen: new Date().toISOString() },
        ],
        secretWord: 'apple',
        currentDescriberIndex: 0,
        turnStartTime: new Date().toISOString()
      };
      mockGet.mockReturnValueOnce({ promise: jest.fn().mockResolvedValue({ Item: game }) });

      const event = {
        ...mockEvent,
        requestContext: { ...mockEvent.requestContext, connectionId: 'test-connection-456' },
        body: JSON.stringify({ action: 'submitGuess', gameId: 'game-1', guess: 'banana' })
      };

      await default_handler(event as APIGatewayEvent, {} as any, {} as any);

      expect(mockPostToConnection).toHaveBeenCalledWith(expect.objectContaining({
        Data: expect.stringContaining('newGuess')
      }));
    });
  });
});