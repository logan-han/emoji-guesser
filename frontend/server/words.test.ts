import { CATEGORIES, DICTIONARY } from './dictionary.js';
import { generateHint, nextHintAt, pickWords } from './words.js';

describe('the dictionary', () => {
  const all = Object.values(DICTIONARY).flat();

  test('is big enough that games do not repeat themselves', () => {
    expect(all.length).toBeGreaterThan(900);
    for (const category of CATEGORIES) expect(DICTIONARY[category].length).toBeGreaterThanOrEqual(20);
  });

  test('holds single lowercase words the hint and the guess check can handle', () => {
    for (const word of all) expect(word).toMatch(/^[a-z]{3,12}$/);
  });

  test('lists each word once', () => {
    const repeats = all.filter((word, i) => all.indexOf(word) !== i);
    expect(repeats).toEqual([]);
  });
});

describe('picking words', () => {
  test('offers three words from three different categories', () => {
    for (let i = 0; i < 200; i++) {
      const words = pickWords();
      expect(words).toHaveLength(3);
      const categories = words.map((word) => CATEGORIES.find((category) => DICTIONARY[category].includes(word)));
      expect(new Set(categories).size).toBe(3);
    }
  });

  test('draws from the whole dictionary over time', () => {
    const seen = new Set(Array.from({ length: 2000 }, () => pickWords()).flat());
    expect(seen.size).toBeGreaterThan(500);
  });

  test('can be pinned for tests', () => {
    expect(pickWords(() => 0)).toEqual([DICTIONARY[CATEGORIES[0]][0], DICTIONARY[CATEGORIES[1]][0], DICTIONARY[CATEGORIES[2]][0]]);
  });
});

describe('hints', () => {
  test('start as all blanks', () => {
    expect(generateHint('hello', 0, 60_000)).toBe('_ _ _ _ _');
  });

  test('reveal letters as the round goes on, never the last one', () => {
    const revealed = (hint: string) => (hint.match(/[A-Z]/g) ?? []).length;
    const early = generateHint('elephant', 10_000, 60_000);
    const late = generateHint('elephant', 50_000, 60_000);
    expect(revealed(early)).toBeGreaterThan(0);
    expect(revealed(late)).toBeGreaterThan(revealed(early));
    expect(generateHint('elephant', 60_000, 60_000).endsWith('_')).toBe(true);
    expect(revealed(generateHint('elephant', 120_000, 60_000))).toBe(7);
  });

  test('are the same on every call, so every server instance agrees', () => {
    expect(generateHint('rocket', 30_000, 60_000)).toBe(generateHint('rocket', 30_000, 60_000));
  });

  test('never give away a one-letter word', () => {
    expect(generateHint('a', 59_000, 60_000)).toBe('_');
    expect(nextHintAt('a', 0, 60_000)).toBeNull();
  });

  test('know when they next change', () => {
    const first = nextHintAt('rocket', 0, 60_000)!;
    expect(generateHint('rocket', first - 2, 60_000)).toBe('_ _ _ _ _ _');
    expect(generateHint('rocket', first, 60_000)).not.toBe('_ _ _ _ _ _');
    const second = nextHintAt('rocket', first, 60_000)!;
    expect(second).toBeGreaterThan(first);
    expect(nextHintAt('rocket', 59_999, 60_000)).toBeNull();
  });
});
