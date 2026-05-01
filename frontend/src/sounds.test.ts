import { playSound, soundEffects } from './sounds';

describe('Sound Effects', () => {
  let mockPlay: jest.Mock;
  let mockAudio: any;

  beforeEach(() => {
    mockPlay = jest.fn().mockResolvedValue(undefined);
    mockAudio = {
      play: mockPlay,
      pause: jest.fn(),
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    
    // Mock the global Audio constructor
    global.Audio = jest.fn().mockImplementation(() => mockAudio);
  });

  describe('soundEffects', () => {
    test('contains all expected sound effects', () => {
      expect(soundEffects).toEqual({
        gameStart: '/sounds/game-start.wav',
        correctGuess: '/sounds/correct-guess.wav',
        buttonClick: '/sounds/button-click.wav',
        playerJoined: '/sounds/player-joined.wav',
        gameEnd: '/sounds/game-end.wav',
        emojiSelect: '/sounds/emoji-select.wav',
        newGuess: '/sounds/new-guess.wav',
        timeUp: '/sounds/time-up.wav',
      });
    });
  });

  describe('playSound', () => {
    test('plays gameStart sound', () => {
      playSound('gameStart');

      expect(Audio).toHaveBeenCalledWith('/sounds/game-start.wav');
      expect(mockPlay).toHaveBeenCalled();
    });

    test('plays correctGuess sound', () => {
      playSound('correctGuess');

      expect(Audio).toHaveBeenCalledWith('/sounds/correct-guess.wav');
      expect(mockPlay).toHaveBeenCalled();
    });

    test('plays buttonClick sound', () => {
      playSound('buttonClick');

      expect(Audio).toHaveBeenCalledWith('/sounds/button-click.wav');
      expect(mockPlay).toHaveBeenCalled();
    });

    test('handles play error gracefully', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
      mockPlay.mockRejectedValue(new Error('Autoplay blocked'));

      playSound('gameStart');

      // Wait for the promise to resolve
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Could not play sound: gameStart',
        expect.any(Error)
      );

      consoleLogSpy.mockRestore();
    });
  });
});
