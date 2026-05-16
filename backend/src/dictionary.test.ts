import { getRandomWords, generateHint } from './dictionary';

// Mock the random-words package
jest.mock('random-words', () => ({
  generate: jest.fn()
}));

const mockNounOutputQueue: string[][] = [];

// Mock compromise with controllable noun output so tests can exercise filtering and retries
jest.mock('compromise', () => {
  return jest.fn((text: string) => ({
    nouns: () => ({
      out: (format: string) => {
        if (format === 'array') {
          if (mockNounOutputQueue.length > 0) {
            return mockNounOutputQueue.shift();
          }
          return text.split(/\s+/).filter(Boolean);
        }
        return [];
      }
    })
  }));
});

import { generate } from 'random-words';

describe('Dictionary Functions', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('getRandomWords', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      mockNounOutputQueue.length = 0;
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

    test('should filter invalid nouns and retry until it has 3 unique words', async () => {
      const mockGenerate = generate as jest.MockedFunction<typeof generate>;
      mockGenerate
        .mockReturnValueOnce(['cat', 'cat', 'verylongwordname'] as any)
        .mockReturnValueOnce(['space', 'dog', 'bird'] as any);
      mockNounOutputQueue.push(
        ['cat', 'cat', 'verylongwordname', 'space word'],
        ['space', 'dog', 'bird']
      );

      const words = await getRandomWords();

      expect(words).toEqual(['cat', 'space', 'dog']);
      expect(mockGenerate).toHaveBeenCalledTimes(2);
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

    test('should reveal more letters as time progresses', () => {
      const word = 'elephant';
      const hint1 = generateHint(word, 10000, 60000);
      const hint2 = generateHint(word, 30000, 60000);
      const hint3 = generateHint(word, 50000, 60000);

      // Count revealed letters (uppercase letters in hint)
      const countRevealed = (hint: string) => (hint.match(/[A-Z]/g) || []).length;

      // More time should reveal more letters
      expect(countRevealed(hint2)).toBeGreaterThanOrEqual(countRevealed(hint1));
      expect(countRevealed(hint3)).toBeGreaterThanOrEqual(countRevealed(hint2));
    });

    test('should handle different time limits', () => {
      const word = 'hello';

      // Short time limit
      const hintShort = generateHint(word, 5000, 10000);
      // Long time limit at same relative progress
      const hintLong = generateHint(word, 30000, 60000);

      // Both should reveal letters since they're at same relative progress (50%)
      expect(hintShort).not.toBe('_ _ _ _ _');
      expect(hintLong).not.toBe('_ _ _ _ _');
    });

    test('should handle edge case with very short words', () => {
      const hint = generateHint('ab', 30000, 60000);
      // Should only reveal at most 1 letter (keeping last hidden)
      expect(hint.endsWith('_')).toBe(true);
    });

    test('should not crash with zero time elapsed', () => {
      const hint = generateHint('test', 0, 60000);
      expect(hint).toBe('_ _ _ _');
    });

    test('should not crash with time equal to total time', () => {
      const hint = generateHint('hello', 60000, 60000);
      // Should reveal letters but keep last hidden
      expect(hint.endsWith('_')).toBe(true);
    });

    test('should not crash with time exceeding total time', () => {
      const hint = generateHint('hello', 90000, 60000);
      // Should not crash, and last letter should still be hidden
      expect(hint.endsWith('_')).toBe(true);
    });

    test('should uppercase revealed letters', () => {
      const word = 'test';
      const hint = generateHint(word, 30000, 60000);

      // Any revealed letters should be uppercase
      const revealedLetters = hint.match(/[A-Za-z]/g) || [];
      revealedLetters.forEach(letter => {
        if (letter !== '_') {
          expect(letter).toBe(letter.toUpperCase());
        }
      });
    });

    test('should preserve word length in hint', () => {
      const word = 'elephant';
      const hint = generateHint(word, 30000, 60000);

      // Count the number of letter positions (excluding spaces)
      const hintPositions = hint.split(' ').length;
      expect(hintPositions).toBe(word.length);
    });
  });

  describe('getRandomWords edge cases', () => {
    test('should handle generate returning single word as string', async () => {
      const mockGenerate = generate as jest.MockedFunction<typeof generate>;
      mockGenerate
        .mockReturnValueOnce('singleword' as any)
        .mockReturnValueOnce(['cat', 'dog'] as any);

      const words = await getRandomWords();
      expect(words).toEqual(['singleword', 'cat', 'dog']);
    });

    test('should return unique words', async () => {
      const mockGenerate = generate as jest.MockedFunction<typeof generate>;
      mockGenerate.mockReturnValue(['cat', 'dog', 'bird'] as any);

      const words = await getRandomWords();
      const uniqueWords = new Set(words);
      expect(uniqueWords.size).toBe(words.length);
    });
  });
});
