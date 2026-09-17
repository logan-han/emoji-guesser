// Shared mock harness for the websockets suites. Importing this module sets the
// test table name before ./websockets reads it at load time, so it must come
// first in a suite's import list.
process.env.SUPABASE_GAMES_TABLE = 'test-games-table';

export const GAMES_TABLE = 'test-games-table';

export type CommandType = 'get' | 'put' | 'update' | 'delete' | 'scan';

// Commands are built with `new`, so these need real functions rather than arrows.
const command = (type: CommandType) => function (input: any) { return { type, input }; };

export const mocks = {
  dbSend: vi.fn(),
  publishGameEvent: vi.fn(),
  getCommand: vi.fn(command('get')),
  putCommand: vi.fn(command('put')),
  updateCommand: vi.fn(command('update')),
  deleteCommand: vi.fn(command('delete')),
  scanCommand: vi.fn(command('scan')),
  apgSend: vi.fn(),
  postToConnectionCommand: vi.fn(function (input: any) { return { input }; }),
  getRandomWords: vi.fn(),
  generateHint: vi.fn(),
};

export const supabaseStoreMock = () => ({
  gameStore: { send: mocks.dbSend },
  publishGameEvent: mocks.publishGameEvent,
  GetCommand: mocks.getCommand,
  PutCommand: mocks.putCommand,
  UpdateCommand: mocks.updateCommand,
  DeleteCommand: mocks.deleteCommand,
  ScanCommand: mocks.scanCommand,
});

export const apiGatewayMock = () => ({
  ApiGatewayManagementApiClient: vi.fn(function () { return { send: mocks.apgSend }; }),
  PostToConnectionCommand: mocks.postToConnectionCommand,
});

export const dictionaryMock = () => ({
  getRandomWords: mocks.getRandomWords,
  generateHint: mocks.generateHint,
});

export const resetMocks = () => {
  vi.clearAllMocks();
  mocks.dbSend.mockResolvedValue({});
  mocks.publishGameEvent.mockResolvedValue(undefined);
  mocks.apgSend.mockResolvedValue({});
  mocks.getCommand.mockImplementation(command('get'));
  mocks.putCommand.mockImplementation(command('put'));
  mocks.updateCommand.mockImplementation(command('update'));
  mocks.deleteCommand.mockImplementation(command('delete'));
  mocks.scanCommand.mockImplementation(command('scan'));
  mocks.postToConnectionCommand.mockImplementation(function (input: any) { return { input }; });
  mocks.getRandomWords.mockResolvedValue(['apple', 'banana', 'orange']);
  mocks.generateHint.mockReturnValue('_ _ _ _ _');
};

type DbHandler = (input: any) => any;

// Routes db.send by command kind so multi-step flows (get, then update, then get
// again) do not depend on the order the handler happens to issue them in.
export const routeDb = (handlers: Partial<Record<CommandType, DbHandler>>) => {
  mocks.dbSend.mockImplementation(async (cmd: any) => {
    const handler = handlers[cmd.type as CommandType];
    return handler ? handler(cmd.input) : {};
  });
};

// Every game returned by `get` is a fresh clone: websockets.ts mutates the item
// it reads, and a shared object would leak those mutations into later reads.
export const serveGame = (game: any, handlers: Partial<Record<CommandType, DbHandler>> = {}) => {
  routeDb({ get: () => ({ Item: structuredClone(game) }), ...handlers });
};

export const eventWith = (body: Record<string, unknown>, connectionId = 'conn-1') => ({
  requestContext: { connectionId, domainName: 'test-domain.com', stage: 'test' },
  body: JSON.stringify(body),
}) as any;

/** Payloads pushed down the websocket to one connection, newest last. */
export const sentTo = (connectionId: string): any[] =>
  mocks.postToConnectionCommand.mock.calls
    .filter(([arg]: any[]) => arg.ConnectionId === connectionId)
    .map(([arg]: any[]) => JSON.parse(arg.Data));

export const recipientsOf = (action: string): string[] =>
  mocks.postToConnectionCommand.mock.calls
    .filter(([arg]: any[]) => JSON.parse(arg.Data).action === action)
    .map(([arg]: any[]) => arg.ConnectionId);

export const updateExpressions = (): string[] =>
  mocks.updateCommand.mock.calls.map(([input]: any[]) => input.UpdateExpression);

export const player = (connectionId: string, overrides: Record<string, unknown> = {}) => ({
  connectionId,
  sessionId: `session-${connectionId}`,
  name: `Player ${connectionId}`,
  score: 0,
  lastSeen: new Date().toISOString(),
  ...overrides,
});

/** How many times an action was published over Supabase realtime. */
export const countRealtime = (action: string): number =>
  mocks.publishGameEvent.mock.calls.filter(([, payload]: any[]) => payload.action === action).length;
