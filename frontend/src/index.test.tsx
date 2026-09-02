// Mock ReactDOM.createRoot first
const mockRender = vi.fn();
const mockCreateRoot = vi.fn();

// Make this file a module to satisfy --isolatedModules
export {};

// Set up the mock to return an object with render method
mockCreateRoot.mockReturnValue({ render: mockRender });

// index.tsx does `import ReactDOM from 'react-dom/client'`, so the mock has to
// carry a default export as well as the named one.
vi.mock('react-dom/client', () => ({
  default: { createRoot: mockCreateRoot },
  createRoot: mockCreateRoot,
}));

// Mock the App component
vi.mock('./App', () => ({
  default: function MockApp() {
    return null;
  },
}));

describe('index.tsx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset the mock behavior
    mockCreateRoot.mockReturnValue({ render: mockRender });
    
    // Mock getElementById to return a valid element
    const mockElement = document.createElement('div');
    mockElement.id = 'root';
    document.getElementById = vi.fn().mockReturnValue(mockElement);
  });

  test('calls createRoot and render', async () => {
    // Re-import so the entry module runs again against the fresh mocks
    vi.resetModules();
    await import('./index');

    expect(document.getElementById).toHaveBeenCalledWith('root');
    expect(mockCreateRoot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(mockRender).toHaveBeenCalled();
  });
});
