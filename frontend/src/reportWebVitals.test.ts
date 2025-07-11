import reportWebVitals from './reportWebVitals';

describe('reportWebVitals', () => {
  test('should export a function', () => {
    expect(typeof reportWebVitals).toBe('function');
  });

  test('should not throw when called without parameters', () => {
    expect(() => reportWebVitals()).not.toThrow();
  });

  test('should not throw when called with null', () => {
    expect(() => reportWebVitals(null as any)).not.toThrow();
  });

  test('should not throw when called with undefined', () => {
    expect(() => reportWebVitals(undefined)).not.toThrow();
  });

  test('should not throw when called with a function', () => {
    const mockFunction = jest.fn();
    expect(() => reportWebVitals(mockFunction)).not.toThrow();
  });

  test('should not throw when called with non-function', () => {
    expect(() => reportWebVitals('not a function' as any)).not.toThrow();
  });
});
