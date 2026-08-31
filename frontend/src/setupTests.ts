// jest-dom adds custom jest matchers for asserting on DOM nodes.
// allows you to do things like:
// expect(element).toHaveTextContent(/react/i)
// learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

class MockIntersectionObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
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

// jsdom 16 (react-scripts) ships no Web Crypto; the app requires it for session IDs
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = require('crypto');
  Object.defineProperty(globalThis, 'crypto', {
    writable: true,
    configurable: true,
    value: webcrypto,
  });
}
