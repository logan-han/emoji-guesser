// jest-dom's matchers, wired into vitest's expect.
// Lets us write things like expect(element).toHaveTextContent(/react/i).
import '@testing-library/jest-dom/vitest';

// @testing-library/dom decides whether to pump fake timers by probing for a
// `jest` global. Without it, waitFor() waits on real time and hangs whenever a
// test calls vi.useFakeTimers().
(globalThis as { jest?: unknown }).jest = vi;

class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});

Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: MockIntersectionObserver,
});
