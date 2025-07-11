import { getRandomWords, generateHint } from './dictionary';

// Mock the random-words package
jest.mock('random-words', () => ({
  generate: jest.fn()
}));

// Mock compromise with a simple mock
jest.mock('compromise', () => {
  return jest.fn(() => ({
    nouns: () => ({
      out: (format: string) => {
        if (format === 'array') {
          return ['cat', 'dog', 'house', 'tree', 'book', 'phone', 'table', 'chair', 'water', 'fire'];
        }
        return [];
      }
    })
  }));
});

import { generate } from 'random-words';

describe('Dictionary Functions', () => {
  describe('getRandomWords', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    test('should return 3 random words', async () => {
      const mockGenerate = generate as jest.MockedFunction<typeof generate>;
      mockGenerate.mockReturnValue(['cat', 'dog', 'house'] as any);

      const words = await getRandomWords();
      
      expect(words).toHaveLength(3);
      expect(words).toEqual(['cat', 'dog', 'house']);
    });

    test('should use fallback words when generate fails', async () => {
      const mockGenerate = generate as jest.MockedFunction<typeof generate>;
      mockGenerate.mockImplementation(() => {
        throw new Error('Package failed');
      });

      const words = await getRandomWords();
      
      expect(words).toHaveLength(3);
      expect(words.every(word => typeof word === 'string')).toBe(true);
    });
  });

  describe('generateHint', () => {
    test('should return all blanks initially', () => {
      const hint = generateHint('hello', 0, 60000);
      expect(hint).toBe('_ _ _ _ _');
    });

    test('should reveal letters over time', () => {
      const hint = generateHint('hello', 10000, 60000);
      // Should reveal some letters but not all blanks
      expect(hint).not.toBe('_ _ _ _ _');
      expect(hint.endsWith('_')).toBe(true); // Last letter should always be hidden
    });

    test('should never reveal the last letter', () => {
      const hint = generateHint('hello', 59000, 60000);
      expect(hint.endsWith('_')).toBe(true);
    });

    test('should handle single letter words', () => {
      const hint = generateHint('a', 30000, 60000);
      expect(hint).toBe('_');
    });

    test('should handle two letter words', () => {
      const hint = generateHint('to', 0, 60000);
      expect(hint).toBe('_ _');
    });

    test('should reveal letters in deterministic order', () => {
      const word = 'test';
      const hint1 = generateHint(word, 10000, 60000);
      const hint2 = generateHint(word, 10000, 60000);
      expect(hint1).toBe(hint2);
    });
  });
});
