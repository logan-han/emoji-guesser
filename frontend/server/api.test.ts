const queries: string[] = [];

vi.mock('@neondatabase/serverless', () => ({
  neon: () => ({
    query: async (text: string) => {
      queries.push(text);
      return [];
    },
  }),
}));

test('the functions run the shared handler on the Neon store', async () => {
  const { default: fn } = await import('../api/action.js');
  const res = await fn.fetch(
    new Request('http://test/api/action', {
      method: 'POST',
      body: JSON.stringify({ action: 'joinGame', sessionId: 'session-0001', gameId: 'ABC123' }),
    }),
  );
  expect(await res.json()).toEqual({
    messages: [{ action: 'error', message: 'Game not found.' }],
    stream: { gameId: 'ABC123', after: null },
  });
  expect(queries.some((q) => q.includes('create table if not exists games'))).toBe(true);
  expect(queries.at(-1)).toContain('select data, version, seq from games');
});
