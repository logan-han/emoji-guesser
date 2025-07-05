
// A simple sound utility to play audio files.

// Define the available sound effects
export const soundEffects = {
  gameStart: '/sounds/game-start.mp3',
  correctGuess: '/sounds/correct-guess.mp3',
  buttonClick: '/sounds/button-click.mp3',
  playerJoined: '/sounds/player-joined.mp3',
  gameEnd: '/sounds/game-end.mp3',
  emojiSelect: '/sounds/emoji-select.mp3',
  newGuess: '/sounds/new-guess.mp3',
};

// Function to play a sound
export const playSound = (sound: keyof typeof soundEffects) => {
  const audio = new Audio(soundEffects[sound]);
  audio.play().catch(error => {
    // Autoplay is often blocked by browsers, so we log the error silently.
    // This prevents the console from being spammed with errors.
    console.log(`Could not play sound: ${sound}`, error);
  });
};
