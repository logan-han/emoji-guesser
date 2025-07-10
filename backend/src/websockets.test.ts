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
import { connect, disconnect, default_handler } from './websockets';

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
});