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
 * Shows blanks initially, then gradually reveals letters at stable intervals
 * Maintains previously revealed letters
 */
export function generateHint(word: string, timeElapsed: number, totalTime: number): string {
  const normalizedWord = word.toLowerCase();
  const wordLength = normalizedWord.length;
  
  // Calculate stable intervals - reveal one letter every interval
  const maxRevealCount = Math.max(1, Math.floor(wordLength * 0.7)); // Maximum 70% of letters, at least 1
  const revealInterval = totalTime / maxRevealCount; // How often to reveal a letter
  
  // Calculate how many letters should be revealed based on time elapsed
  let lettersToReveal = Math.floor(timeElapsed / revealInterval);
  lettersToReveal = Math.min(lettersToReveal, maxRevealCount);
  
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
