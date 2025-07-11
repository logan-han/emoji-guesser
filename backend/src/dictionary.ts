import { generate } from 'random-words';

// Type declaration for compromise since @types/compromise is not available
declare const compromiseNlp: {
  (text: string): {
    nouns(): {
      out(format: string): string[];
    };
  };
};

// Import compromise using require for compatibility
const nlp = require('compromise') as typeof compromiseNlp;

/**
 * Generates 3 random nouns using random-words and compromise
 */
export async function getRandomWords(): Promise<string[]> {
  let nouns: string[] = [];
  try {
    while (nouns.length < 3) {
      // Generate a batch of random words
      const words = generate({ exactly: 50 });
      
      // Filter for nouns using compromise
      const wordsArray = Array.isArray(words) ? words : [words];
      const doc = nlp(wordsArray.join(' '));
      const foundNouns = doc.nouns().out('array');
      
      // Add unique nouns that meet the length criteria
      for (const noun of foundNouns) {
        const cleanNoun = noun.toLowerCase().trim();
        if (cleanNoun.length <= 12 && !nouns.includes(cleanNoun) && !cleanNoun.includes(' ')) {
          nouns.push(cleanNoun);
          if (nouns.length >= 3) {
            break;
          }
        }
      }
    }
    return nouns.slice(0, 3);
  } catch (error) {
    console.error('Error generating random words:', error);
    // Fallback to a simple word list if the package fails
    const fallbackWords = [
      'cat', 'dog', 'bird', 'fish', 'tree', 'house', 'car', 'book', 'phone', 'table',
      'chair', 'water', 'fire', 'earth', 'sky', 'sun', 'moon', 'star', 'cloud', 'rain',
      'snow', 'wind', 'mountain', 'river', 'ocean', 'forest', 'flower', 'apple', 'pizza', 'music'
    ];
    
    // Shuffle and pick 3 random words
    const shuffled = fallbackWords.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, 3);
  }
}

/**
 * Generates hint pattern for a word
 * Shows blanks initially, then gradually reveals letters based on elapsed time
 * Letters are revealed at evenly distributed intervals throughout the round
 * Always keeps the last letter hidden for guessing
 */
export function generateHint(word: string, timeElapsed: number, totalTime: number): string {
  const normalizedWord = word.toLowerCase();
  const wordLength = normalizedWord.length;
  
  // Always leave at least one letter hidden for guessing
  const maxRevealCount = Math.max(0, wordLength - 1);
  
  if (maxRevealCount === 0) {
    // Single letter word - show as blank
    return normalizedWord.replace(/./g, '_ ').trim();
  }
  
  // Calculate reveal intervals based on total time and number of letters to reveal
  // Distribute the reveals evenly throughout the round duration
  const revealInterval = totalTime / (maxRevealCount + 1); // +1 to account for initial delay
  
  // Calculate how many letters should be revealed based on time elapsed
  let lettersToReveal = Math.floor(timeElapsed / revealInterval);
  
  // Cap at maximum reveal count
  lettersToReveal = Math.min(lettersToReveal, maxRevealCount);
  
  if (lettersToReveal === 0) {
    // Show only blanks initially
    return normalizedWord.replace(/./g, '_ ').trim();
  }
  
  // Create a deterministic but random-looking order for revealing letters
  const letterPositions = Array.from({ length: wordLength }, (_, i) => i);
  
  // Shuffle the positions array consistently based on the word itself
  let wordHash = 0;
  for (let i = 0; i < normalizedWord.length; i++) {
    wordHash = (wordHash * 31 + normalizedWord.charCodeAt(i)) % 1000;
  }
  
  for (let i = letterPositions.length - 1; i > 0; i--) {
    const j = (wordHash + i) % (i + 1);
    [letterPositions[i], letterPositions[j]] = [letterPositions[j], letterPositions[i]];
  }
  
  // Select positions to reveal based on count
  const positionsToReveal = new Set(
    letterPositions.slice(0, lettersToReveal)
  );
  
  // Build the hint string
  return normalizedWord
    .split('')
    .map((letter, index) => positionsToReveal.has(index) ? letter.toUpperCase() : '_')
    .join(' ');
}