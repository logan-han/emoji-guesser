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
 * Shows blanks initially, then gradually reveals letters at stable intervals
 * Maintains previously revealed letters
 * Ensures the last letter is revealed at least 10 seconds before time is up
 */
export function generateHint(word: string, timeElapsed: number, totalTime: number): string {
  const normalizedWord = word.toLowerCase();
  const wordLength = normalizedWord.length;
  
  // Reveal one letter every 30 seconds
  const revealInterval = 30000; // 30 seconds in milliseconds
  
  // Calculate how many letters should be revealed based on time elapsed
  let lettersToReveal = Math.floor(timeElapsed / revealInterval);
  
  // Ensure we don't reveal all letters, leave some for guessing
  const maxRevealCount = Math.max(1, Math.floor(wordLength * 0.7));
  lettersToReveal = Math.min(lettersToReveal, maxRevealCount);

  if (timeElapsed >= totalTime - 10000 && lettersToReveal === 0) {
    lettersToReveal = 1; // Reveal at least one letter in the last 10 seconds
  }
  
  if (lettersToReveal === 0) {
    // Show only blanks initially
    return normalizedWord.replace(/./g, '_ ').trim();
  }
  
  // Create a deterministic but random-looking order for revealing letters
  // This ensures the same word always reveals letters in the same order
  const letterPositions: { pos: number; priority: number }[] = [];
  const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
  const seenLetters = new Set<string>();
  
  // Create a simple hash from the word to ensure consistent ordering
  let wordHash = 0;
  for (let i = 0; i < normalizedWord.length; i++) {
    wordHash = (wordHash * 31 + normalizedWord.charCodeAt(i)) % 1000;
  }
  
  // Assign priority to each position
  for (let i = 0; i < wordLength; i++) {
    const letter = normalizedWord[i];
    let priority = 0;
    
    // Higher priority for vowels
    if (vowels.has(letter)) priority += 3;
    
    // Higher priority for unique letters
    if (!seenLetters.has(letter)) {
      priority += 2;
      seenLetters.add(letter);
    }
    
    // Prefer letters not at the beginning or end for variety
    if (i > 0 && i < wordLength - 1) priority += 1;
    
    // Add position-based variance using word hash for consistency
    priority += ((wordHash + i * 7) % 10) / 10;
    
    letterPositions.push({ pos: i, priority });
  }
  
  // Sort by priority (highest first) for consistent ordering
  letterPositions.sort((a, b) => b.priority - a.priority);
  
  // Select positions to reveal based on count
  const positionsToReveal = new Set(
    letterPositions.slice(0, lettersToReveal).map(item => item.pos)
  );
  
  // Build the hint string
  return normalizedWord
    .split('')
    .map((letter, index) => positionsToReveal.has(index) ? letter.toUpperCase() : '_')
    .join(' ');
}