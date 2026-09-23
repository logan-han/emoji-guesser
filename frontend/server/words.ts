import { CATEGORIES, DICTIONARY } from './dictionary.js';

const draw = <T>(items: readonly T[], random: () => number): T => items[Math.floor(random() * items.length)];

/** One word from each of three different categories, drawn with `random` so tests can pin it. */
export function pickWords(random: () => number = Math.random, count = 3): string[] {
  const categories = [...CATEGORIES];
  const picked: string[] = [];
  while (picked.length < count && categories.length > 0) {
    const category = categories.splice(Math.floor(random() * categories.length), 1)[0];
    picked.push(draw(DICTIONARY[category], random));
  }
  return picked;
}

/** First reveal lands 15% into the round, the rest are evenly spaced; the last letter never shows. */
function revealSchedule(wordLength: number, totalMs: number) {
  const maxReveals = Math.max(0, wordLength - 1);
  const firstAt = totalMs * 0.15;
  const interval = maxReveals > 0 ? (totalMs - firstAt) / maxReveals : Infinity;
  return { maxReveals, firstAt, interval };
}

function revealedCount(wordLength: number, elapsedMs: number, totalMs: number): number {
  const { maxReveals, firstAt, interval } = revealSchedule(wordLength, totalMs);
  if (maxReveals === 0 || elapsedMs < firstAt) return 0;
  return Math.min(maxReveals, Math.floor((elapsedMs - firstAt) / interval) + 1);
}

/**
 * The guessers' view of the word, e.g. `_ P _ _ _`. Which letters show is fixed per word, so
 * every server instance and every refresh agree.
 */
export function generateHint(word: string, elapsedMs: number, totalMs: number): string {
  const normalized = word.toLowerCase();
  const reveals = revealedCount(normalized.length, elapsedMs, totalMs);
  if (reveals === 0) return normalized.replace(/./g, '_ ').trim();

  const positions = Array.from({ length: normalized.length - 1 }, (_, i) => i);
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = (hash * 31 + normalized.charCodeAt(i)) % 1000;
  }
  for (let i = positions.length - 1; i > 0; i--) {
    const j = (hash + i) % (i + 1);
    [positions[i], positions[j]] = [positions[j], positions[i]];
  }
  const shown = new Set(positions.slice(0, reveals));

  return normalized
    .split('')
    .map((letter, index) => (index !== normalized.length - 1 && shown.has(index) ? letter.toUpperCase() : '_'))
    .join(' ');
}

/** Milliseconds into the round when the hint next changes, or null once it has stopped changing. */
export function nextHintAt(word: string, elapsedMs: number, totalMs: number): number | null {
  const { maxReveals, firstAt, interval } = revealSchedule(word.length, totalMs);
  const reveals = revealedCount(word.length, elapsedMs, totalMs);
  if (reveals >= maxReveals) return null;
  // A millisecond late, so float rounding at the boundary cannot leave the hint unchanged.
  return Math.ceil(firstAt + reveals * interval) + 1;
}
