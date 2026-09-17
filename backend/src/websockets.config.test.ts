// Deliberately does not import ./testUtils, which sets the table name env var
// before ./websockets reads it at load time.
const mocks = vi.hoisted(() => ({
  dbSend: vi.fn(),
  scanCommand: vi.fn(function (input: any) { return { input }; }),
}));

vi.mock('./dictionary', () => ({ getRandomWords: vi.fn(), generateHint: vi.fn() }));
vi.mock('./supabaseStore', () => ({
  gameStore: { send: mocks.dbSend },
  publishGameEvent: vi.fn(),
  GetCommand: vi.fn(),
  PutCommand: vi.fn(),
  UpdateCommand: vi.fn(),
  DeleteCommand: vi.fn(),
  ScanCommand: mocks.scanCommand,
}));
vi.mock('@aws-sdk/client-apigatewaymanagementapi', () => ({
  ApiGatewayManagementApiClient: vi.fn(function () { return { send: vi.fn() }; }),
  PostToConnectionCommand: vi.fn(function (input: any) { return { input }; }),
}));

describe('Table name', () => {
  test('falls back to "games" when the environment does not name one', async () => {
    delete process.env.SUPABASE_GAMES_TABLE;
    mocks.dbSend.mockResolvedValue({ Items: [] });

    const { listPublicGames } = await import('./websockets');
    await listPublicGames({} as any, {} as any, {} as any);

    expect(mocks.scanCommand).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: 'games' }),
    );
  });
});
