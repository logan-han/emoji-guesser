// Set environment variables for testing before importing modules
process.env.GAMES_TABLE = 'test-games-table';

import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { connect, disconnect, default_handler } from './websockets';

// Create mock instances that can be reset
const dynamoDbMock = {
  get: jest.fn().mockReturnThis(),
  put: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  scan: jest.fn().mockReturnThis(),
  promise: jest.fn().mockResolvedValue({
    Item: {
      gameId: 'GAME123',
      owner: 'test-connection-123',
      players: [{ id: 'test-connection-123', name: 'Test Player' }],
      status: 'lobby'
    }
  })
};

const apiGatewayMock = {
  postToConnection: jest.fn().mockReturnThis(),
  promise: jest.fn().mockResolvedValue({})
};

// Mock AWS SDK
jest.mock('aws-sdk', () => {
  return {
    DynamoDB: {
      DocumentClient: jest.fn(() => dynamoDbMock)
    },
    ApiGatewayManagementApi: jest.fn(() => apiGatewayMock)
  };
});

// Mock uuid
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mocked-uuid-123456')
}));

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
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const result = await connect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Connected'
      });
      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith({
        ConnectionId: 'test-connection-123',
        Data: JSON.stringify({
          action: 'connected',
          connectionId: 'test-connection-123'
        })
      });
    });
  });

  describe('Disconnect Handler', () => {
    test('handles disconnection and cleans up games', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      // Mock finding games with the disconnected player
      dynamoDbMock.scan().promise.mockResolvedValue({
        Items: [
          {
            gameId: 'GAME123',
            players: [
              { connectionId: 'test-connection-123', name: 'Player 1' },
              { connectionId: 'other-connection', name: 'Player 2' }
            ]
          }
        ]
      });
      
      dynamoDbMock.update().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const result = await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Disconnected'
      });
      expect(dynamoDbMock.scan).toHaveBeenCalled();
      expect(dynamoDbMock.update).toHaveBeenCalled();
    });

    test('deletes empty games when last player disconnects', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      
      // Mock finding a game with only the disconnected player
      dynamoDbMock.scan().promise.mockResolvedValue({
        Items: [
          {
            gameId: 'GAME123',
            players: [
              { connectionId: 'test-connection-123', name: 'Player 1' }
            ]
          }
        ]
      });
      
      dynamoDbMock.delete().promise.mockResolvedValue({});

      await disconnect(mockEvent as APIGatewayEvent, {} as any, {} as any);

      expect(dynamoDbMock.delete).toHaveBeenCalledWith({
        TableName: 'test-games-table',
        Key: { gameId: 'GAME123' }
      });
    });
  });

  describe('Message Handler', () => {
    test('handles createGame action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.put().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'createGame',
          sessionId: 'session-123',
          timeLimit: 180
        })
      };

      const result = await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(result).toEqual({
        statusCode: 200,
        body: 'Message handled.'
      });
      expect(dynamoDbMock.put).toHaveBeenCalled();
      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'test-connection-123',
          Data: expect.stringContaining('"action":"gameCreated"')
        })
      );
    });

    test('handles joinGame action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      // Mock existing game
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          ownerId: 'owner-123',
          players: [
            { connectionId: 'owner-123', name: 'Player 1', score: 0 }
          ],
          gameState: 'WAITING'
        }
      });
      
      dynamoDbMock.update().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'GAME123',
          sessionId: 'session-123',
          playerName: 'Player 2'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(dynamoDbMock.get).toHaveBeenCalledWith({
        TableName: 'test-games-table',
        Key: { gameId: 'GAME123' }
      });
      expect(dynamoDbMock.update).toHaveBeenCalled();
    });

    test('handles startGame action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      // Mock existing game with multiple players
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          ownerId: 'test-connection-123',
          players: [
            { connectionId: 'test-connection-123', name: 'Player 1', score: 0 },
            { connectionId: 'other-connection', name: 'Player 2', score: 0 }
          ],
          gameState: 'WAITING'
        }
      });
      
      dynamoDbMock.update().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'startGame',
          gameId: 'GAME123',
          sessionId: 'session-123',
          timeLimit: 180
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(dynamoDbMock.update).toHaveBeenCalled();
      expect(apiGatewayMock.postToConnection).toHaveBeenCalledTimes(4); // gameStarted broadcast + provideWord + status messages
    });

    test('handles submitWord action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      // Mock game in progress waiting for word
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          players: [
            { connectionId: 'test-connection-123', name: 'Word Master', score: 0 },
            { connectionId: 'describer-123', name: 'Describer', score: 0 }
          ],
          gameState: 'IN_PROGRESS',
          wordMasterIndex: 0,
          currentDescriberIndex: 1,
          turnState: 'WAITING_FOR_WORD'
        }
      });
      
      dynamoDbMock.update().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'submitWord',
          gameId: 'GAME123',
          word: 'elephant'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(dynamoDbMock.update).toHaveBeenCalledWith(
        expect.objectContaining({
          UpdateExpression: 'set secretWord = :w, turnState = :t, turnStartTime = :ts'
        })
      );
      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          ConnectionId: 'describer-123',
          Data: expect.stringContaining('"action":"describeWord"')
        })
      );
    });

    test('handles submitGuess action with correct guess', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      // Mock game with secret word
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          players: [
            { connectionId: 'test-connection-123', name: 'Guesser', score: 0 },
            { connectionId: 'describer-123', name: 'Describer', score: 0 }
          ],
          secretWord: 'elephant',
          currentDescriberIndex: 1,
          turnStartTime: new Date().toISOString()
        }
      });
      
      dynamoDbMock.update().promise.mockResolvedValue({});
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'submitGuess',
          gameId: 'GAME123',
          guess: 'elephant'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('"action":"wordGuessed"')
        })
      );
    });

    test('handles submitEmoji action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          players: [
            { connectionId: 'test-connection-123', name: 'Player 1' },
            { connectionId: 'other-connection', name: 'Player 2' }
          ]
        }
      });
      
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'submitEmoji',
          gameId: 'GAME123',
          emoji: '🐘'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('"action":"newEmoji"')
        })
      );
    });

    test('handles heartbeat action', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.scan().promise.mockResolvedValue({ Items: [] });
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'heartbeat',
          sessionId: 'session-123'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('"action":"heartbeatAck"')
        })
      );
    });

    test('handles unknown action with error', async () => {
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'unknownAction'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('"action":"error"')
        })
      );
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

  describe('Game Logic Edge Cases', () => {
    test('prevents starting game with insufficient players', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          ownerId: 'test-connection-123',
          players: [
            { connectionId: 'test-connection-123', name: 'Player 1', score: 0 }
          ],
          gameState: 'WAITING'
        }
      });
      
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'startGame',
          gameId: 'GAME123'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('You need at least 2 players to start')
        })
      );
    });

    test('prevents non-owner from starting game', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          ownerId: 'different-connection',
          players: [
            { connectionId: 'different-connection', name: 'Owner', score: 0 },
            { connectionId: 'test-connection-123', name: 'Player 2', score: 0 }
          ],
          gameState: 'WAITING'
        }
      });
      
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'startGame',
          gameId: 'GAME123'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('Only the owner can start the game')
        })
      );
    });

    test('prevents joining game in progress', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          gameState: 'IN_PROGRESS',
          players: []
        }
      });
      
      apiGatewayMock.postToConnection().promise.mockResolvedValue({});

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'joinGame',
          gameId: 'GAME123'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      expect(apiGatewayMock.postToConnection).toHaveBeenCalledWith(
        expect.objectContaining({
          Data: expect.stringContaining('Game already in progress')
        })
      );
    });

    test('prevents describer from guessing their own word', async () => {
      const dynamoDbMock = new AWS.DynamoDB.DocumentClient();
      const apiGatewayMock = new AWS.ApiGatewayManagementApi();
      
      dynamoDbMock.get().promise.mockResolvedValue({
        Item: {
          gameId: 'GAME123',
          players: [
            { connectionId: 'test-connection-123', name: 'Describer', score: 0 }
          ],
          currentDescriberIndex: 0,
          secretWord: 'elephant'
        }
      });

      const eventWithBody = {
        ...mockEvent,
        body: JSON.stringify({
          action: 'submitGuess',
          gameId: 'GAME123',
          guess: 'elephant'
        })
      };

      await default_handler(eventWithBody as APIGatewayEvent, {} as any, {} as any);

      // Should not call any update or broadcast for describer's guess
      expect(dynamoDbMock.update).not.toHaveBeenCalled();
    });
  });
});
