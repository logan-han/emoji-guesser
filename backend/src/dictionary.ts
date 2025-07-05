import { generate } from 'random-words';

/**
 * Generates 3 random words using the random-words package
 */
export function getRandomWords(): string[] {
  try {
    // Generate 3 random words with reasonable length
    const result = generate({ exactly: 3, maxLength: 12 });
    
    // Ensure we always return an array of strings
    if (Array.isArray(result)) {
      return result;
    } else if (typeof result === 'string') {
      // If it returns a single string, wrap it in an array and generate 2 more
      const additionalWords = generate({ exactly: 2, maxLength: 12 });
      return [result, ...(Array.isArray(additionalWords) ? additionalWords : [additionalWords])];
    } else {
      throw new Error('Unexpected result type from random-words');
    }
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
 * Shows blanks initially, then gradually reveals letters up to 50%
 */
export function generateHint(word: string, timeElapsed: number, totalTime: number): string {
  const normalizedWord = word.toLowerCase();
  const wordLength = normalizedWord.length;
  
  // Calculate how many letters to reveal based on time elapsed
  const maxRevealCount = Math.floor(wordLength * 0.5); // Maximum 50% of letters
  const timeProgress = Math.min(timeElapsed / totalTime, 1); // 0 to 1
  
  // Reveal letters gradually, but not immediately
  const revealStartThreshold = 0.2; // Start revealing after 20% of time
  let lettersToReveal = 0;
  
  if (timeProgress > revealStartThreshold) {
    const revealProgress = (timeProgress - revealStartThreshold) / (1 - revealStartThreshold);
    lettersToReveal = Math.floor(revealProgress * maxRevealCount);
  }
  
  if (lettersToReveal === 0) {
    // Show only blanks initially
    return normalizedWord.replace(/./g, '_ ').trim();
  }
  
  // Determine which letters to reveal (prefer unique letters and avoid consecutive)
  const letterPositions: number[] = [];
  const seenLetters = new Set<string>();
  
  // First pass: add positions of unique letters
  for (let i = 0; i < wordLength; i++) {
    const letter = normalizedWord[i];
    if (!seenLetters.has(letter)) {
      letterPositions.push(i);
      seenLetters.add(letter);
    }
  }
  
  // Second pass: add remaining positions if needed
  for (let i = 0; i < wordLength && letterPositions.length < wordLength; i++) {
    if (!letterPositions.includes(i)) {
      letterPositions.push(i);
    }
  }
  
  // Shuffle and take the number we need to reveal
  const shuffledPositions = letterPositions.sort(() => Math.random() - 0.5);
  const positionsToReveal = new Set(shuffledPositions.slice(0, lettersToReveal));
  
  // Build the hint string
  return normalizedWord
    .split('')
    .map((letter, index) => positionsToReveal.has(index) ? letter.toUpperCase() : '_')
    .join(' ');
}
