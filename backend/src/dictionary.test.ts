import type { MockInstance } from 'vitest';
import { generate } from 'random-words';
import { getRandomWords, generateHint } from './dictionary';

// Mock the random-words package
vi.mock('random-words', () => ({
  generate: vi.fn()
}));

// dictionary.ts loads compromise with require, which vi.mock cannot intercept, so seed Node's
// module cache with a controllable stand-in before the hoisted imports run.
const mockNounOutputQueue = vi.hoisted(() => {
  const queue: string[][] = [];
  const nlp = (text: string) => ({
    nouns: () => ({
      out: (format: string) => {
        if (format === 'array') {
          if (queue.length > 0) {
            return queue.shift();
          }
          return text.split(/\s+/).filter(Boolean);
        }
        return [];
      }
    })
  });
  const id = require.resolve('compromise');
  require.cache[id] = { id, filename: id, loaded: true, exports: nlp } as unknown as NodeModule;
  return queue;
});

describe('Dictionary Functions', () => {
  let consoleLogSpy: MockInstance;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('getRandomWords', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockNounOutputQueue.length = 0;
    });

    test('should return 3 random words', async () => {
      const mockGenerate = vi.mocked(generate);
      mockGenerate.mockReturnValue(['cat', 'dog', 'house'] as any);

      const words = await getRandomWords();
      
      expect(words).toHaveLength(3);
      expect(words).toEqual(['cat', 'dog', 'house']);
    });

    test('should use fallback words when generate fails', async () => {
      const mockGenerate = vi.mocked(generate);
      mockGenerate.mockImplementation(() => {
        throw new Error('Package failed');
      });

      const words = await getRandomWords();
      
      expect(words).toHaveLength(3);
      expect(words.every(word => typeof word === 'string')).toBe(true);
    });

    test('should filter invalid nouns and retry until it has 3 unique words', async () => {
      const mockGenerate = vi.mocked(generate);
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
      const mockGenerate = vi.mocked(generate);
      mockGenerate
        .mockReturnValueOnce('singleword' as any)
        .mockReturnValueOnce(['cat', 'dog'] as any);

      const words = await getRandomWords();
      expect(words).toEqual(['singleword', 'cat', 'dog']);
    });

    test('should return unique words', async () => {
      const mockGenerate = vi.mocked(generate);
      mockGenerate.mockReturnValue(['cat', 'dog', 'bird'] as any);

      const words = await getRandomWords();
      const uniqueWords = new Set(words);
      expect(uniqueWords.size).toBe(words.length);
    });
  });
});
