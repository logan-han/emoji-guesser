import { redact, viewFor } from './redact.js';
import { inProgress, player } from './testing.js';

describe('what each client gets to see', () => {
  const round = inProgress({ spectators: [player('dan', { isSpectator: true })] }, 'rocket');

  test('a player sees their own session id and nobody else’s', () => {
    const view = viewFor(round, 'session-bob');
    expect(view.players.map((p) => p.sessionId)).toEqual([undefined, 'session-bob', undefined]);
    expect(view.spectators.map((p) => p.sessionId)).toEqual([undefined]);
    expect(view.ownerSessionId).toBeUndefined();
  });

  test('the owner also sees that they own the game', () => {
    expect(viewFor(round, 'session-ann').ownerSessionId).toBe('session-ann');
  });

  test('nobody gets the secret word or the word options inside the game', () => {
    for (const session of ['session-ann', 'session-bob', null]) {
      const view = viewFor({ ...round, wordOptions: ['a', 'b', 'c'] }, session) as Record<string, unknown>;
      expect(view.secretWord).toBeUndefined();
      expect(view.wordOptions).toBeUndefined();
    }
  });

  test('connection ids and scores stay visible to all', () => {
    expect(viewFor(round, null).players).toEqual(round.players.map(({ sessionId: _s, ...rest }) => rest));
  });

  test('messages carrying games are redacted, and nothing else about them changes', () => {
    const message = { action: 'publicGamesList', games: [round], game: round, word: 'rocket' };
    const out = redact(message, 'session-bob');
    expect(out.word).toBe('rocket');
    expect((out.game as { secretWord?: string }).secretWord).toBeUndefined();
    expect((out.games as { players: { sessionId?: string }[] }[])[0].players[0].sessionId).toBeUndefined();
    expect(message.game.secretWord).toBe('rocket');
  });
});
