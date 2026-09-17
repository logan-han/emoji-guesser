const mockCreateClient = vi.fn((_url: string, _key: string) => ({ id: 'client' }));

vi.mock('@supabase/supabase-js', () => ({
  createClient: (url: string, key: string) => mockCreateClient(url, key),
}));

const loadModule = async () => {
  vi.resetModules();
  return import('./supabase');
};

describe('supabase client', () => {
  beforeEach(() => {
    mockCreateClient.mockClear();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  test('builds a client when both the url and the anon key are configured', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');

    const { supabase } = await loadModule();

    expect(mockCreateClient).toHaveBeenCalledWith('https://example.supabase.co', 'anon-key');
    expect(supabase).not.toBeNull();
  });

  test('stays null when the anon key is missing so the app falls back to websockets', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');

    const { supabase } = await loadModule();

    expect(mockCreateClient).not.toHaveBeenCalled();
    expect(supabase).toBeNull();
  });
});
