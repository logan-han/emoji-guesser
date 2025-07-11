// Mock ReactDOM.createRoot first
const mockRender = jest.fn();
const mockCreateRoot = jest.fn();

// Set up the mock to return an object with render method
mockCreateRoot.mockReturnValue({ render: mockRender });

jest.mock('react-dom/client', () => ({
  createRoot: mockCreateRoot
}));

// Mock the App component
jest.mock('./App', () => {
  return function MockApp() {
    return null;
  };
});

describe('index.tsx', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset the mock behavior
    mockCreateRoot.mockReturnValue({ render: mockRender });
    
    // Mock getElementById to return a valid element
    const mockElement = document.createElement('div');
    mockElement.id = 'root';
    document.getElementById = jest.fn().mockReturnValue(mockElement);
  });

  test('calls createRoot and render', () => {
    // Import and run the index file
    jest.isolateModules(() => {
      require('./index');
    });

    expect(document.getElementById).toHaveBeenCalledWith('root');
    expect(mockCreateRoot).toHaveBeenCalledWith(expect.any(HTMLElement));
    expect(mockRender).toHaveBeenCalled();
  });
});
