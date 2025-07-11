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
        gameStart: '/sounds/game-start.mp3',
        correctGuess: '/sounds/correct-guess.mp3',
        buttonClick: '/sounds/button-click.mp3',
        playerJoined: '/sounds/player-joined.mp3',
        gameEnd: '/sounds/game-end.mp3',
        emojiSelect: '/sounds/emoji-select.mp3',
        newGuess: '/sounds/new-guess.mp3',
        timeUp: '/sounds/time-up.mp3',
      });
    });
  });

  describe('playSound', () => {
    test('plays gameStart sound', () => {
      playSound('gameStart');

      expect(Audio).toHaveBeenCalledWith('/sounds/game-start.mp3');
      expect(mockPlay).toHaveBeenCalled();
    });

    test('plays correctGuess sound', () => {
      playSound('correctGuess');

      expect(Audio).toHaveBeenCalledWith('/sounds/correct-guess.mp3');
      expect(mockPlay).toHaveBeenCalled();
    });

    test('plays buttonClick sound', () => {
      playSound('buttonClick');

      expect(Audio).toHaveBeenCalledWith('/sounds/button-click.mp3');
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
