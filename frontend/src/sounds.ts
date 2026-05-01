
// A simple sound utility to play audio files.

// Define the available sound effects
export const soundEffects = {
  gameStart: '/sounds/game-start.wav',
  correctGuess: '/sounds/correct-guess.wav',
  buttonClick: '/sounds/button-click.wav',
  playerJoined: '/sounds/player-joined.wav',
  gameEnd: '/sounds/game-end.wav',
  emojiSelect: '/sounds/emoji-select.wav',
  newGuess: '/sounds/new-guess.wav',
  timeUp: '/sounds/time-up.wav',
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
