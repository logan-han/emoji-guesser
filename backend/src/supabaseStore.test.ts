// Mock @supabase/supabase-js before importing
const mockFrom = jest.fn();
const mockChannel = jest.fn();
const mockRemoveChannel = jest.fn();
const mockCreateClient = jest.fn((..._args: any[]) => ({
  from: mockFrom,
  channel: mockChannel,
  removeChannel: mockRemoveChannel,
}));

jest.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string, opts: any) => mockCreateClient(url, key, opts),
}));

const ORIGINAL_ENV = { ...process.env };

const setupEnv = () => {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  process.env.SUPABASE_GAMES_TABLE = 'games-test';
};

const buildQueryBuilder = (response: { data?: any; error?: any }) => {
  const builder: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockResolvedValue(response),
    delete: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue(response),
    then: undefined,
  };
  // Final `await` on the chain should resolve to the response
  builder.then = (resolve: any) => Promise.resolve(response).then(resolve);
  return builder;
};

const loadModule = () => {
  jest.resetModules();
  return require('./supabaseStore');
};

describe('supabaseStore', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    setupEnv();
    mockFrom.mockReset();
    mockChannel.mockReset();
    mockRemoveChannel.mockReset();
    mockCreateClient.mockClear();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  describe('client initialisation', () => {
    test('throws when SUPABASE_URL is missing', async () => {
      delete process.env.SUPABASE_URL;
      const { gameStore, GetCommand } = loadModule();
      await expect(
        gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }))
      ).rejects.toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
    });

    test('throws when SUPABASE_SERVICE_ROLE_KEY is missing', async () => {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      const { gameStore, GetCommand } = loadModule();
      await expect(
        gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }))
      ).rejects.toThrow('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
    });

    test('creates a single supabase client and reuses it across calls', async () => {
      const { gameStore, GetCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: null }));

      await gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }));
      await gameStore.send(new GetCommand({ Key: { gameId: 'g2' } }));

      expect(mockCreateClient).toHaveBeenCalledTimes(1);
      expect(mockCreateClient).toHaveBeenCalledWith(
        'https://example.supabase.co',
        'service-role-key',
        expect.objectContaining({
          auth: { persistSession: false, autoRefreshToken: false },
        })
      );
    });

    test('reads SUPABASE_GAMES_TABLE env at module load (defaults to games)', async () => {
      delete process.env.SUPABASE_GAMES_TABLE;
      const { gameStore, GetCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: null }));

      await gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }));

      expect(mockFrom).toHaveBeenCalledWith('games');
    });
  });

  describe('GetCommand', () => {
    test('returns Item when row exists', async () => {
      const { gameStore, GetCommand } = loadModule();
      const game = { gameId: 'g1', ownerId: 'p1', updatedAt: '2024-01-01' };
      const qb = buildQueryBuilder({ data: { data: game }, error: null });
      mockFrom.mockReturnValue(qb);

      const result = await gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }));

      expect(result).toEqual({ Item: game });
      expect(mockFrom).toHaveBeenCalledWith('games-test');
      expect(qb.select).toHaveBeenCalledWith('data');
      expect(qb.eq).toHaveBeenCalledWith('game_id', 'g1');
      expect(qb.maybeSingle).toHaveBeenCalled();
    });

    test('returns empty object when row is absent', async () => {
      const { gameStore, GetCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: null }));

      const result = await gameStore.send(new GetCommand({ Key: { gameId: 'missing' } }));

      expect(result).toEqual({});
    });

    test('throws when supabase returns an error', async () => {
      const { gameStore, GetCommand } = loadModule();
      mockFrom.mockReturnValue(
        buildQueryBuilder({ data: null, error: new Error('db down') })
      );

      await expect(
        gameStore.send(new GetCommand({ Key: { gameId: 'g1' } }))
      ).rejects.toThrow('db down');
    });
  });

  describe('PutCommand', () => {
    test('upserts row with mapped columns and computed updatedAt', async () => {
      const { gameStore, PutCommand } = loadModule();
      const qb = buildQueryBuilder({ error: null });
      mockFrom.mockReturnValue(qb);

      const before = Date.now();
      const result = await gameStore.send(
        new PutCommand({
          Item: {
            gameId: 'g1',
            isPublic: true,
            gameState: 'WAITING',
            ttl: 1700000000,
            players: [],
          },
        })
      );
      const after = Date.now();

      expect(result).toEqual({});
      expect(qb.upsert).toHaveBeenCalledTimes(1);
      const [row, opts] = qb.upsert.mock.calls[0];
      expect(row.game_id).toBe('g1');
      expect(row.is_public).toBe(true);
      expect(row.game_state).toBe('WAITING');
      expect(row.ttl).toBe(1700000000);
      expect(row.data.gameId).toBe('g1');
      expect(row.data.updatedAt).toBe(row.updated_at);
      expect(new Date(row.updated_at).getTime()).toBeGreaterThanOrEqual(before);
      expect(new Date(row.updated_at).getTime()).toBeLessThanOrEqual(after);
      expect(opts).toEqual({ onConflict: 'game_id' });
    });

    test('preserves existing updatedAt when provided', async () => {
      const { gameStore, PutCommand } = loadModule();
      const qb = buildQueryBuilder({ error: null });
      mockFrom.mockReturnValue(qb);

      await gameStore.send(
        new PutCommand({
          Item: {
            gameId: 'g1',
            updatedAt: '2024-06-01T00:00:00.000Z',
            isPublic: false,
            gameState: 'IN_PROGRESS',
          },
        })
      );

      const [row] = qb.upsert.mock.calls[0];
      expect(row.updated_at).toBe('2024-06-01T00:00:00.000Z');
      expect(row.data.updatedAt).toBe('2024-06-01T00:00:00.000Z');
    });

    test('coerces missing isPublic to false and ttl to null', async () => {
      const { gameStore, PutCommand } = loadModule();
      const qb = buildQueryBuilder({ error: null });
      mockFrom.mockReturnValue(qb);

      await gameStore.send(
        new PutCommand({
          Item: { gameId: 'g1', gameState: 'WAITING' },
        })
      );

      const [row] = qb.upsert.mock.calls[0];
      expect(row.is_public).toBe(false);
      expect(row.ttl).toBeNull();
    });

    test('throws when upsert reports an error', async () => {
      const { gameStore, PutCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ error: new Error('write failed') }));

      await expect(
        gameStore.send(new PutCommand({ Item: { gameId: 'g1', gameState: 'WAITING' } }))
      ).rejects.toThrow('write failed');
    });
  });

  describe('UpdateCommand', () => {
    test('returns empty object when target game is missing', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: null }));

      const result = await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'missing' },
          UpdateExpression: 'set gameState = :s',
          ExpressionAttributeValues: { ':s': 'IN_PROGRESS' },
        })
      );

      expect(result).toEqual({});
    });

    test('applies a SET expression and upserts the new row', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = {
        gameId: 'g1',
        gameState: 'WAITING',
        isPublic: true,
        players: [{ id: 'p1' }],
      };
      const getBuilder = buildQueryBuilder({ data: { data: existing }, error: null });
      const upsertBuilder = buildQueryBuilder({ error: null });
      mockFrom.mockReturnValueOnce(getBuilder).mockReturnValueOnce(upsertBuilder);

      const result = await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set gameState = :s',
          ExpressionAttributeValues: { ':s': 'IN_PROGRESS' },
        })
      );

      expect(result).toEqual({});
      const [row] = upsertBuilder.upsert.mock.calls[0];
      expect(row.data.gameState).toBe('IN_PROGRESS');
      expect(row.data.gameId).toBe('g1');
      expect(row.data.players).toEqual([{ id: 'p1' }]);
      expect(row.data.updatedAt).toBe(row.updated_at);
    });

    test('returns Attributes when ReturnValues=ALL_NEW', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', gameState: 'WAITING' };
      mockFrom
        .mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }))
        .mockReturnValueOnce(buildQueryBuilder({ error: null }));

      const result = await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set gameState = :s',
          ExpressionAttributeValues: { ':s': 'IN_PROGRESS' },
          ReturnValues: 'ALL_NEW',
        })
      );

      expect(result.Attributes.gameState).toBe('IN_PROGRESS');
      expect(result.Attributes.gameId).toBe('g1');
    });

    test('supports REMOVE alongside SET', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = {
        gameId: 'g1',
        gameState: 'IN_PROGRESS',
        secretWord: 'apple',
        timerEndsAt: 12345,
      };
      const upsertBuilder = buildQueryBuilder({ error: null });
      mockFrom
        .mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }))
        .mockReturnValueOnce(upsertBuilder);

      await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set gameState = :s REMOVE secretWord, timerEndsAt',
          ExpressionAttributeValues: { ':s': 'ENDED' },
        })
      );

      const [row] = upsertBuilder.upsert.mock.calls[0];
      expect(row.data.gameState).toBe('ENDED');
      expect(row.data.secretWord).toBeUndefined();
      expect(row.data.timerEndsAt).toBeUndefined();
    });

    test('resolves ExpressionAttributeNames placeholders', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', state: 'OLD' };
      const upsertBuilder = buildQueryBuilder({ error: null });
      mockFrom
        .mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }))
        .mockReturnValueOnce(upsertBuilder);

      await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set #s = :v',
          ExpressionAttributeNames: { '#s': 'state' },
          ExpressionAttributeValues: { ':v': 'NEW' },
        })
      );

      const [row] = upsertBuilder.upsert.mock.calls[0];
      expect(row.data.state).toBe('NEW');
    });

    test('skips update when condition expression does not match', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', gameState: 'WAITING' };
      mockFrom.mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }));

      const result = await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set gameState = :next',
          ConditionExpression: 'gameState = :expected',
          ExpressionAttributeValues: { ':expected': 'IN_PROGRESS', ':next': 'ENDED' },
        })
      );

      expect(result).toEqual({});
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    test('applies update when condition expression matches', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', gameState: 'WAITING' };
      const upsertBuilder = buildQueryBuilder({ error: null });
      mockFrom
        .mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }))
        .mockReturnValueOnce(upsertBuilder);

      await gameStore.send(
        new UpdateCommand({
          Key: { gameId: 'g1' },
          UpdateExpression: 'set gameState = :next',
          ConditionExpression: 'gameState = :expected',
          ExpressionAttributeValues: { ':expected': 'WAITING', ':next': 'IN_PROGRESS' },
        })
      );

      const [row] = upsertBuilder.upsert.mock.calls[0];
      expect(row.data.gameState).toBe('IN_PROGRESS');
    });

    test('rejects unsupported condition expressions', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', gameState: 'WAITING' };
      mockFrom.mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }));

      await expect(
        gameStore.send(
          new UpdateCommand({
            Key: { gameId: 'g1' },
            UpdateExpression: 'set gameState = :v',
            ConditionExpression: 'gameState <> :expected',
            ExpressionAttributeValues: { ':expected': 'ENDED', ':v': 'IN_PROGRESS' },
          })
        )
      ).rejects.toThrow('Unsupported condition expression');
    });

    test('throws when upsert errors during update', async () => {
      const { gameStore, UpdateCommand } = loadModule();
      const existing = { gameId: 'g1', gameState: 'WAITING' };
      mockFrom
        .mockReturnValueOnce(buildQueryBuilder({ data: { data: existing }, error: null }))
        .mockReturnValueOnce(buildQueryBuilder({ error: new Error('upsert exploded') }));

      await expect(
        gameStore.send(
          new UpdateCommand({
            Key: { gameId: 'g1' },
            UpdateExpression: 'set gameState = :s',
            ExpressionAttributeValues: { ':s': 'IN_PROGRESS' },
          })
        )
      ).rejects.toThrow('upsert exploded');
    });
  });

  describe('DeleteCommand', () => {
    test('deletes the row by game_id', async () => {
      const { gameStore, DeleteCommand } = loadModule();
      const qb = buildQueryBuilder({ error: null });
      mockFrom.mockReturnValue(qb);

      const result = await gameStore.send(new DeleteCommand({ Key: { gameId: 'g1' } }));

      expect(result).toEqual({});
      expect(qb.delete).toHaveBeenCalled();
      expect(qb.eq).toHaveBeenCalledWith('game_id', 'g1');
    });

    test('throws when delete reports an error', async () => {
      const { gameStore, DeleteCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ error: new Error('boom') }));

      await expect(
        gameStore.send(new DeleteCommand({ Key: { gameId: 'g1' } }))
      ).rejects.toThrow('boom');
    });
  });

  describe('ScanCommand', () => {
    test('returns rows mapped from data column', async () => {
      const { gameStore, ScanCommand } = loadModule();
      const rows = [{ data: { gameId: 'g1' } }, { data: { gameId: 'g2' } }];
      mockFrom.mockReturnValue(buildQueryBuilder({ data: rows, error: null }));

      const result = await gameStore.send(new ScanCommand({}));

      expect(result.Items).toEqual([{ gameId: 'g1' }, { gameId: 'g2' }]);
    });

    test('filters out rows with empty data', async () => {
      const { gameStore, ScanCommand } = loadModule();
      const rows = [{ data: { gameId: 'g1' } }, { data: null }];
      mockFrom.mockReturnValue(buildQueryBuilder({ data: rows, error: null }));

      const result = await gameStore.send(new ScanCommand({}));

      expect(result.Items).toEqual([{ gameId: 'g1' }]);
    });

    test('applies the public-waiting filter when expression matches', async () => {
      const { gameStore, ScanCommand } = loadModule();
      const qb = buildQueryBuilder({ data: [], error: null });
      mockFrom.mockReturnValue(qb);

      await gameStore.send(
        new ScanCommand({
          FilterExpression: 'isPublic = :true and gameState = :waiting',
          ExpressionAttributeValues: { ':true': true, ':waiting': 'WAITING' },
        })
      );

      expect(qb.eq).toHaveBeenCalledWith('is_public', true);
      expect(qb.eq).toHaveBeenCalledWith('game_state', 'WAITING');
    });

    test('returns empty list when supabase returns no data', async () => {
      const { gameStore, ScanCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: null }));

      const result = await gameStore.send(new ScanCommand({}));

      expect(result.Items).toEqual([]);
    });

    test('throws when scan reports an error', async () => {
      const { gameStore, ScanCommand } = loadModule();
      mockFrom.mockReturnValue(buildQueryBuilder({ data: null, error: new Error('scan fail') }));

      await expect(gameStore.send(new ScanCommand({}))).rejects.toThrow('scan fail');
    });
  });

  describe('Unsupported commands', () => {
    test('throws for unknown command instances', async () => {
      const { gameStore } = loadModule();
      await expect(gameStore.send({} as any)).rejects.toThrow('Unsupported Supabase store command.');
    });
  });

  describe('publishGameEvent', () => {
    const buildChannel = () => {
      const channel: any = {
        subscribe: jest.fn(),
        send: jest.fn().mockResolvedValue('ok'),
      };
      return channel;
    };

    test('subscribes, broadcasts, and removes the channel', async () => {
      const { publishGameEvent } = loadModule();
      const channel = buildChannel();
      channel.subscribe.mockImplementation((cb: any) => {
        cb('SUBSCRIBED');
        return channel;
      });
      mockChannel.mockReturnValue(channel);

      await publishGameEvent('g1', { action: 'gameUpdated' });

      expect(mockChannel).toHaveBeenCalledWith('game:g1');
      expect(channel.send).toHaveBeenCalledWith({
        type: 'broadcast',
        event: 'game_event',
        payload: { action: 'gameUpdated' },
      });
      expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
    });

    test('rejects when channel reports CHANNEL_ERROR', async () => {
      const { publishGameEvent } = loadModule();
      const channel = buildChannel();
      channel.subscribe.mockImplementation((cb: any) => {
        cb('CHANNEL_ERROR');
        return channel;
      });
      mockChannel.mockReturnValue(channel);

      await expect(publishGameEvent('g1', {})).rejects.toThrow(
        'Realtime channel game:g1 failed with status CHANNEL_ERROR'
      );
    });

    test('throws when broadcast returns a non-ok response and still removes channel', async () => {
      const { publishGameEvent } = loadModule();
      const channel = buildChannel();
      channel.subscribe.mockImplementation((cb: any) => {
        cb('SUBSCRIBED');
        return channel;
      });
      channel.send.mockResolvedValue('error');
      mockChannel.mockReturnValue(channel);

      await expect(publishGameEvent('g1', {})).rejects.toThrow(
        'Realtime broadcast failed with status error'
      );
      expect(mockRemoveChannel).toHaveBeenCalledWith(channel);
    });

    test('rejects on subscription timeout', async () => {
      jest.useFakeTimers();
      try {
        const { publishGameEvent } = loadModule();
        const channel = buildChannel();
        // Never invoke the callback so the timeout fires
        channel.subscribe.mockImplementation(() => channel);
        mockChannel.mockReturnValue(channel);

        const promise = publishGameEvent('g1', {});
        jest.advanceTimersByTime(5000);
        await expect(promise).rejects.toThrow('Timed out subscribing to game:g1');
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
