import type { Mock } from 'vitest';
import { playSound, soundEffects } from './sounds';

describe('Sound Effects', () => {
  let mockPlay: Mock;
  let mockAudio: any;

  beforeEach(() => {
    mockPlay = vi.fn().mockResolvedValue(undefined);
    mockAudio = {
      play: mockPlay,
      pause: vi.fn(),
      currentTime: 0,
      duration: 0,
      volume: 1,
      muted: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    global.Audio = vi.fn(function () {
      return mockAudio;
    }) as unknown as typeof Audio;
  });

  describe('soundEffects', () => {
    test('exposes the full set of expected sound effects', () => {
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

    test('every value points to a /sounds/*.wav path', () => {
      Object.values(soundEffects).forEach((path) => {
        expect(path).toMatch(/^\/sounds\/[a-z-]+\.wav$/);
      });
    });
  });

  describe('playSound', () => {
    const cases = Object.entries(soundEffects) as [keyof typeof soundEffects, string][];

    test.each(cases)('plays %s by constructing Audio(%s) and calling play once', (key, path) => {
      playSound(key);

      expect(Audio).toHaveBeenCalledTimes(1);
      expect(Audio).toHaveBeenCalledWith(path);
      expect(mockPlay).toHaveBeenCalledTimes(1);
    });

    test('swallows autoplay rejections and logs a single warning', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      mockPlay.mockRejectedValue(new Error('Autoplay blocked'));

      playSound('gameStart');
      await Promise.resolve();

      expect(consoleLogSpy).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Could not play sound: gameStart',
        expect.any(Error)
      );

      consoleLogSpy.mockRestore();
    });

    test('successful play does not log', async () => {
      const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      playSound('buttonClick');
      await Promise.resolve();

      expect(consoleLogSpy).not.toHaveBeenCalled();
      consoleLogSpy.mockRestore();
    });
  });
});
