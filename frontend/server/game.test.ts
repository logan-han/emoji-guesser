import {
  WORD_CHOICE_MS,
  applyAction,
  createGame,
  describerOf,
  dropMember,
  isMember,
  nextDeadline,
  randomName,
  stripTags,
  tick,
} from './game.js';
import type { Action } from './game.js';
import { T0, actions, game, inProgress, player, sent, testCtx } from './testing.js';
import type { Game } from './types.js';
import { generateHint } from './words.js';

const ann = 'session-ann';
const bob = 'session-bob';
const cat = 'session-cat';

const act = (g: Game, session: string, action: Action, now = T0) => applyAction(g, session, action, testCtx(now));

describe('creating a game', () => {
  test('makes the caller the owner of a waiting game with the requested settings', () => {
    const { game: made, out } = createGame('ABC123', ann, { playerName: 'Ann', timeLimit: 90, maxRounds: 3, isPublic: true }, testCtx());

    expect(made).toMatchObject({
      gameId: 'ABC123',
      gameState: 'WAITING',
      ownerSessionId: ann,
      ownerId: made!.players[0].connectionId,
      timeLimit: 90,
      maxRounds: 3,
      isPublic: true,
      spectators: [],
    });
    expect(made!.players).toEqual([expect.objectContaining({ sessionId: ann, name: 'Ann', score: 0 })]);
    expect(out).toEqual([{ to: { only: [ann] }, message: expect.objectContaining({ action: 'gameCreated' }) }]);
  });

  test('falls back to the defaults for settings outside the allowed range', () => {
    const { game: made } = createGame('ABC123', ann, { timeLimit: 5, maxRounds: 99, isPublic: 'yes' }, testCtx());
    expect(made).toMatchObject({ timeLimit: 120, maxRounds: 2, isPublic: false });
  });

  test('invents a name when the one sent is only markup', () => {
    const { game: made } = createGame('ABC123', ann, { playerName: '<b></b>' }, testCtx());
    expect(made!.players[0].name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+ \d\d$/);
  });

  test('strips tags and trims names to twenty characters', () => {
    const { game: made } = createGame('ABC123', ann, { playerName: '  <i>Anastasia Wolfenstein</i>  ' }, testCtx());
    expect(made!.players[0].name).toBe('Anastasia Wolfenstei');
    expect(made!.players[0].name.length).toBeLessThanOrEqual(20);
  });
});

describe('joining', () => {
  test('adds a new player to a waiting game and tells everyone', () => {
    const { game: after, out } = act(game(), 'session-dan', { action: 'joinGame', playerName: 'Dan' });

    expect(after!.players.map((p) => p.name)).toEqual(['ann', 'bob', 'cat', 'Dan']);
    expect(out.map((o) => [o.to, o.message.action])).toEqual([
      [{ only: ['session-dan'] }, 'playerJoined'],
      [{ except: ['session-dan'] }, 'playerJoined'],
    ]);
  });

  test('seats a newcomer as a spectator once the game has started', () => {
    const { game: after, out } = act(inProgress({}, 'rocket'), 'session-dan', { action: 'joinGame', playerName: 'Dan' });

    expect(after!.players).toHaveLength(3);
    expect(after!.spectators).toEqual([expect.objectContaining({ name: 'Dan', isSpectator: true })]);
    expect(actions(out)).toEqual(['spectatorJoined', 'playerJoined']);
  });

  test('welcomes a returning player back into their own seat', () => {
    const { game: after, out } = act(game(), bob, { action: 'joinGame', playerName: 'Bobby' });

    expect(after!.players.map((p) => p.name)).toEqual(['ann', 'Bobby', 'cat']);
    expect(out.map((o) => [o.to, o.message.action])).toEqual([
      [{ only: [bob] }, 'playerJoined'],
      [{ except: [bob] }, 'playerReconnected'],
    ]);
  });

  test('keeps the old name when the one sent on return sanitises away', () => {
    const { game: after } = act(game(), bob, { action: 'joinGame', playerName: '<b></b>' });
    expect(after!.players[1].name).toBe('bob');
  });

  test('hands a returning describer their word options mid-choice', () => {
    const { out } = act(inProgress(), ann, { action: 'joinGame' });
    expect(sent(out, 'chooseWord')).toEqual([
      { to: { only: [ann] }, message: { action: 'chooseWord', wordOptions: ['apple', 'rocket', 'zebra'] } },
    ]);
  });

  test('hands a returning describer their secret word mid-round', () => {
    const { out } = act(inProgress({}, 'rocket'), ann, { action: 'joinGame' });
    expect(sent(out, 'describeWord')).toEqual([
      { to: { only: [ann] }, message: expect.objectContaining({ action: 'describeWord', word: 'rocket' }) },
    ]);
  });

  test('hands a returning guesser the hint the round is up to', () => {
    const hint = generateHint('rocket', 20_000, 60_000);
    const round = inProgress({ currentHint: hint }, 'rocket', T0 - 20_000);
    const { out } = act(round, bob, { action: 'joinGame' });
    expect(sent(out, 'hintUpdated')).toEqual([{ to: { only: [bob] }, message: { action: 'hintUpdated', hint } }]);
  });

  test('tells a returning guesser nothing extra while the word is still being chosen', () => {
    const { out } = act(inProgress(), bob, { action: 'joinGame' });
    expect(actions(out)).toEqual(['playerJoined', 'playerReconnected']);
  });

  test('lets a returning spectator back in without a second seat', () => {
    const watching = inProgress({ spectators: [player('dan', { isSpectator: true })] }, 'rocket');
    const { game: after, out } = act(watching, 'session-dan', { action: 'joinGame', playerName: 'Dan' });

    expect(after!.spectators).toEqual([expect.objectContaining({ name: 'Dan' })]);
    expect(out.map((o) => [o.to, o.message.action])).toEqual([[{ only: ['session-dan'] }, 'spectatorJoined']]);
  });
});

describe('starting', () => {
  test('only the owner can start', () => {
    const { game: after, out } = act(game(), bob, { action: 'startGame' });
    expect(after!.gameState).toBe('WAITING');
    expect(out).toEqual([{ to: { only: [bob] }, message: { action: 'error', message: 'Only the owner can start the game.' } }]);
  });

  test('needs two players', () => {
    const { out } = act(game({ players: [player('ann')] }), ann, { action: 'startGame' });
    expect(out[0].message).toEqual({ action: 'error', message: 'You need at least 2 ready players to start.' });
  });

  test('ignores a second start once the game is under way', () => {
    const { out } = act(inProgress(), ann, { action: 'startGame' });
    expect(out).toEqual([]);
  });

  test('deals the first turn: announcement, private word options, then a status line', () => {
    const { game: after, out } = act(game(), ann, { action: 'startGame', timeLimit: 180, maxRounds: 3 });

    expect(after).toMatchObject({
      gameState: 'IN_PROGRESS',
      currentRound: 1,
      currentDescriberIndex: 0,
      turnState: 'CHOOSING_WORD',
      timeLimit: 180,
      maxRounds: 3,
    });
    expect(after!.wordOptions).toHaveLength(3);
    const describer = describerOf(after!)!;
    expect(out.map((o) => [o.to, o.message.action])).toEqual([
      [{ all: true }, 'gameStarted'],
      [{ only: [describer.sessionId] }, 'chooseWord'],
      [{ all: true }, 'statusMessage'],
    ]);
    expect(out[2].message.message).toBe(`${describer.name} is choosing a word...`);
  });

  test('shuffles the turn order', () => {
    const { game: after } = applyAction(game(), ann, { action: 'startGame' }, testCtx(T0, () => 0));
    expect(after!.players.map((p) => p.name)).not.toEqual(['ann', 'bob', 'cat']);
  });
});

describe('choosing a word', () => {
  test('starts the round for the describer and the guessers', () => {
    const { game: after, out } = act(inProgress(), ann, { action: 'chooseWord', word: 'rocket' });

    expect(after).toMatchObject({ turnState: 'DESCRIBING', secretWord: 'rocket', currentHint: '_ _ _ _ _ _' });
    expect(after!.wordOptions).toBeUndefined();
    expect(out.map((o) => [o.to, o.message.action])).toEqual([
      [{ only: [ann] }, 'describeWord'],
      [{ except: [ann] }, 'turnStarted'],
    ]);
    expect(out[0].message.word).toBe('rocket');
    expect(out[1].message.hint).toBe('_ _ _ _ _ _');
  });

  test('refuses a word from anyone but the describer', () => {
    const { out } = act(inProgress(), bob, { action: 'chooseWord', word: 'rocket' });
    expect(out[0].message).toEqual({ action: 'error', message: 'You are not the current describer.' });
  });

  test('refuses a word that was not on offer', () => {
    const { out } = act(inProgress(), ann, { action: 'chooseWord', word: 'banana' });
    expect(out[0].message).toEqual({ action: 'error', message: 'Invalid word choice.' });
  });

  test('picks the first option for a describer who runs out of time', () => {
    const { game: after, out } = tick(inProgress(), testCtx(T0 + WORD_CHOICE_MS));
    expect(after).toMatchObject({ turnState: 'DESCRIBING', secretWord: 'apple' });
    expect(actions(out)).toEqual(['describeWord', 'turnStarted']);
  });

  test('leaves the choice alone before the ten seconds are up', () => {
    const { out } = tick(inProgress(), testCtx(T0 + WORD_CHOICE_MS - 1));
    expect(out).toEqual([]);
  });
});

describe('guessing', () => {
  const round = () => inProgress({}, 'rocket');

  test('shares a wrong guess with everyone', () => {
    const { game: after, out } = act(round(), bob, { action: 'submitGuess', guess: 'plane' });
    expect(after!.players.every((p) => p.score === 0)).toBe(true);
    expect(out).toEqual([{ to: { all: true }, message: { action: 'newGuess', text: 'bob: plane', guesserId: 'c-bob' } }]);
  });

  test('scores a right guess, faster being worth more, and moves on', () => {
    const { game: after, out } = act(round(), bob, { action: 'submitGuess', guess: ' ROCKET ' }, T0 + 5_000);

    expect(after!.players.find((p) => p.name === 'bob')!.score).toBe(145);
    expect(after!.players.find((p) => p.name === 'ann')!.score).toBe(75);
    expect(actions(out)).toEqual(['wordGuessed', 'nextTurn', 'chooseWord', 'statusMessage']);
    expect(out[0].message).toMatchObject({ guesserName: 'bob', word: 'rocket' });
    expect(after).toMatchObject({ currentDescriberIndex: 1, turnState: 'CHOOSING_WORD' });
  });

  test('gives the minimum score for a slow right guess', () => {
    const { game: after } = act(round(), bob, { action: 'submitGuess', guess: 'rocket' }, T0 + 59_000);
    expect(after!.players.find((p) => p.name === 'bob')!.score).toBe(100);
  });

  test('ignores the describer guessing their own word', () => {
    expect(act(round(), ann, { action: 'submitGuess', guess: 'rocket' }).out).toEqual([]);
  });

  test('ignores spectators, blanks and guesses between rounds', () => {
    const watching = inProgress({ spectators: [player('dan', { isSpectator: true })] }, 'rocket');
    expect(act(watching, 'session-dan', { action: 'submitGuess', guess: 'rocket' }).out).toEqual([]);
    expect(act(round(), bob, { action: 'submitGuess', guess: '<b></b>' }).out).toEqual([]);
    expect(act(inProgress(), bob, { action: 'submitGuess', guess: 'apple' }).out).toEqual([]);
  });

  test('a guess after the buzzer loses to the clock', () => {
    const { game: after, out } = act(round(), bob, { action: 'submitGuess', guess: 'rocket' }, T0 + 60_000);
    expect(actions(out)).toEqual(['timeUp', 'nextTurn', 'chooseWord', 'statusMessage']);
    expect(after!.players.every((p) => p.score === 0)).toBe(true);
  });
});

describe('emoji', () => {
  test('the describer can send and clear emoji while describing', () => {
    expect(act(inProgress({}, 'rocket'), ann, { action: 'submitEmoji', emoji: '🚀' }).out).toEqual([
      { to: { all: true }, message: { action: 'newEmoji', emoji: '🚀' } },
    ]);
    expect(act(inProgress({}, 'rocket'), ann, { action: 'clearEmojis' }).out).toEqual([
      { to: { all: true }, message: { action: 'emojisCleared' } },
    ]);
  });

  test('nobody else can, and not before the word is chosen', () => {
    expect(act(inProgress({}, 'rocket'), bob, { action: 'submitEmoji', emoji: '🚀' }).out).toEqual([]);
    expect(act(inProgress({}, 'rocket'), bob, { action: 'clearEmojis' }).out).toEqual([]);
    expect(act(inProgress(), ann, { action: 'submitEmoji', emoji: '🚀' }).out).toEqual([]);
  });

  test('refuses anything that is not a short emoji', () => {
    for (const emoji of ['', '<img>', 'x'.repeat(33), 42]) {
      expect(act(inProgress({}, 'rocket'), ann, { action: 'submitEmoji', emoji }).out).toEqual([]);
    }
  });
});

describe('the round clock', () => {
  test('reveals hint letters as the round goes on', () => {
    const { game: after, out } = tick(inProgress({}, 'rocket'), testCtx(T0 + 20_000));
    const hint = generateHint('rocket', 20_000, 60_000);
    expect(hint).not.toBe('_ _ _ _ _ _');
    expect(after!.currentHint).toBe(hint);
    expect(out).toEqual([{ to: { all: true }, message: { action: 'hintUpdated', hint } }]);
  });

  test('stays quiet when the hint has not moved on', () => {
    expect(tick(inProgress({}, 'rocket'), testCtx(T0 + 1_000)).out).toEqual([]);
  });

  test("calls time, shows the word and hands the turn on", () => {
    const { game: after, out } = tick(inProgress({}, 'rocket'), testCtx(T0 + 60_000));
    expect(out[0]).toEqual({
      to: { all: true },
      message: { action: 'timeUp', message: "⏰ Time's up! Moving to next turn...", word: 'rocket' },
    });
    expect(after).toMatchObject({ currentDescriberIndex: 1, currentRound: 1, turnState: 'CHOOSING_WORD' });
    expect(after!.secretWord).toBeUndefined();
  });

  test('does nothing outside a game in progress', () => {
    expect(tick(game(), testCtx(T0 + 999_999)).out).toEqual([]);
    expect(tick(inProgress({ turnStartTime: undefined }), testCtx(T0 + 999_999)).out).toEqual([]);
  });

  test('gives every player a turn in every round before the game ends', () => {
    let current: Game = inProgress({ maxRounds: 2 }, 'rocket');
    const describers: string[] = [];
    let now = T0;
    while (current.gameState === 'IN_PROGRESS') {
      describers.push(`${current.currentRound}:${describerOf(current)!.name}`);
      now += 61_000;
      current = tick(current, testCtx(now)).game!;
      if (current.turnState === 'CHOOSING_WORD') {
        now += WORD_CHOICE_MS;
        current = tick(current, testCtx(now)).game!;
      }
    }
    expect(describers).toEqual(['1:ann', '1:bob', '1:cat', '2:ann', '2:bob', '2:cat']);
    expect(current).toMatchObject({ gameState: 'ENDED' });
    expect(current.turnState).toBeUndefined();
  });

  test('ends the game after the last turn of the last round', () => {
    const last = inProgress({ currentRound: 2, currentDescriberIndex: 2 }, 'rocket');
    const { game: after, out } = tick(last, testCtx(T0 + 60_000));
    expect(actions(out)).toEqual(['timeUp', 'gameEnded']);
    expect(after).toMatchObject({ gameState: 'ENDED', endedAt: new Date(T0 + 60_000).toISOString() });
  });
});

describe('the next deadline', () => {
  test('is the word choice cut-off while choosing', () => {
    expect(nextDeadline(inProgress(), T0)).toBe(T0 + WORD_CHOICE_MS);
  });

  test('is the next hint reveal, then the end of the round', () => {
    const round = inProgress({}, 'rocket');
    const firstReveal = nextDeadline(round, T0)!;
    expect(firstReveal).toBeGreaterThan(T0);
    expect(firstReveal).toBeLessThan(T0 + 60_000);
    expect(generateHint('rocket', firstReveal - T0, 60_000)).not.toBe('_ _ _ _ _ _');
    expect(nextDeadline(round, T0 + 59_999)).toBe(T0 + 60_000);
  });

  test('is nothing outside a round', () => {
    expect(nextDeadline(game(), T0)).toBeNull();
    expect(nextDeadline(inProgress({ turnState: undefined }), T0)).toBeNull();
  });
});

describe('leaving', () => {
  test('a spectator slips out quietly', () => {
    const watching = inProgress({ spectators: [player('dan', { isSpectator: true })] }, 'rocket');
    const { game: after, out } = dropMember(watching, 'session-dan', testCtx());
    expect(after!.spectators).toEqual([]);
    expect(actions(out)).toEqual(['gameUpdated']);
  });

  test('the last player out takes the game with them', () => {
    expect(dropMember(game({ players: [player('ann')] }), ann, testCtx()).game).toBeNull();
  });

  test('a stranger leaving changes nothing', () => {
    expect(dropMember(game(), 'session-zed', testCtx()).out).toEqual([]);
  });

  test('the owner leaving the lobby hands it to the next player', () => {
    const { game: after, out } = dropMember(game(), ann, testCtx());
    expect(after).toMatchObject({ ownerId: 'c-bob', ownerSessionId: bob });
    expect(out.map((o) => [o.to, o.message.action])).toEqual([[{ except: [ann] }, 'playerLeft']]);
  });

  test('someone else leaving the lobby leaves the owner in place', () => {
    const { game: after } = dropMember(game(), bob, testCtx());
    expect(after).toMatchObject({ ownerSessionId: ann });
    expect(after!.players.map((p) => p.name)).toEqual(['ann', 'cat']);
  });

  test('ends a game down to its last player', () => {
    const { game: after, out } = dropMember(inProgress({ players: [player('ann'), player('bob')] }, 'rocket'), bob, testCtx());
    expect(after).toMatchObject({ gameState: 'ENDED' });
    expect(out.map((o) => o.message)).toEqual([
      expect.objectContaining({ action: 'gameEnded', message: 'Game ended - bob left and there are not enough players to continue.' }),
    ]);
  });

  test('the describer leaving passes the turn to the next player in order', () => {
    const round = inProgress({ currentDescriberIndex: 1, players: [player('ann'), player('bob'), player('cat'), player('dan')] }, 'rocket');
    const { game: after, out } = dropMember(round, bob, testCtx());

    expect(describerOf(after!)!.name).toBe('cat');
    expect(after).toMatchObject({ currentRound: 1, turnState: 'CHOOSING_WORD' });
    expect(actions(out)).toEqual(['nextTurn', 'chooseWord', 'statusMessage', 'playerLeft']);
    expect(out[3].message.message).toBe('bob (describer) left the game. Moving to next turn.');
  });

  test('the last describer of a round leaving starts the next round', () => {
    const { game: after } = dropMember(inProgress({ currentDescriberIndex: 2 }, 'rocket'), cat, testCtx());
    expect(describerOf(after!)!.name).toBe('ann');
    expect(after!.currentRound).toBe(2);
  });

  test('the last describer of the last round leaving ends the game', () => {
    const round = inProgress({ currentDescriberIndex: 2, currentRound: 2 }, 'rocket');
    expect(actions(dropMember(round, cat, testCtx()).out)).toEqual(['gameEnded', 'playerLeft']);
  });

  test('a guesser ahead of the describer leaving keeps the same describer', () => {
    const { game: after, out } = dropMember(inProgress({ currentDescriberIndex: 2 }, 'rocket'), ann, testCtx());
    expect(describerOf(after!)!.name).toBe('cat');
    expect(after!.currentDescriberIndex).toBe(1);
    expect(after).toMatchObject({ ownerSessionId: bob });
    expect(out.map((o) => o.message.message)).toEqual(['ann left the game.']);
  });

  test('a guesser behind the describer leaving changes nothing about the turn', () => {
    const { game: after } = dropMember(inProgress({}, 'rocket'), cat, testCtx());
    expect(describerOf(after!)!.name).toBe('ann');
  });

  test('leaveGame is the same thing asked for directly', () => {
    const { game: after } = act(game(), bob, { action: 'leaveGame' });
    expect(isMember(after!, bob)).toBe(false);
  });
});

describe('restarting', () => {
  const ended = (overrides: Partial<Game> = {}) =>
    game({
      gameState: 'ENDED',
      endedAt: new Date(T0).toISOString(),
      players: [player('ann', { score: 175 }), player('bob', { score: 100 })],
      spectators: [player('dan', { isSpectator: true })],
      ...overrides,
    });

  test('the owner resets the game, seating the spectators and zeroing the scores', () => {
    const { game: after, out } = act(ended(), ann, { action: 'restartGame', timeLimit: 240 });

    expect(after).toMatchObject({ gameState: 'WAITING', timeLimit: 240, spectators: [] });
    expect(after!.endedAt).toBeUndefined();
    expect(after!.players.map((p) => [p.name, p.score, p.wantsToPlayAgain, p.isOwner])).toEqual([
      ['ann', 0, true, true],
      ['bob', 0, true, false],
      ['dan', 0, true, false],
    ]);
    expect(after!.players[2].isSpectator).toBeUndefined();
    expect(out.map((o) => [o.to, o.message.action])).toEqual([[{ all: true }, 'gameRestarted']]);
  });

  test('the owner cannot restart a game that has not ended', () => {
    expect(act(game(), ann, { action: 'restartGame' }).out[0].message).toEqual({
      action: 'error',
      message: 'Can only restart ended games.',
    });
  });

  test('another player rejoining tells the others', () => {
    const { game: after, out } = act(ended(), bob, { action: 'restartGame' });
    expect(after!.players[1].wantsToPlayAgain).toBe(true);
    expect(out.map((o) => [o.to, o.message.action])).toEqual([
      [{ only: [bob] }, 'gameRestarted'],
      [{ only: [ann] }, 'playerRejoined'],
    ]);
    expect(out[0].message).toMatchObject({ isNewOwner: false, message: 'You have rejoined the game!' });
    expect(out[1].message).toMatchObject({ rejoinedPlayer: 'bob' });
  });

  test('the first player back takes over a game whose owner is gone', () => {
    const { game: after, out } = act(ended({ ownerSessionId: 'session-gone', ownerId: 'c-gone' }), bob, {
      action: 'restartGame',
    });
    expect(after).toMatchObject({ ownerSessionId: bob, ownerId: 'c-bob' });
    expect(out[0].message).toMatchObject({ isNewOwner: true, message: 'You are now the game owner!' });
  });

  test('only players of an ended game can rejoin it', () => {
    expect(act(game(), bob, { action: 'restartGame' }).out[0].message).toEqual({
      action: 'error',
      message: 'Only the owner can restart the game.',
    });
    expect(act(ended(), 'session-zed', { action: 'restartGame' }).out[0].message).toEqual({
      action: 'error',
      message: 'You were not in this game.',
    });
  });
});

describe('everything else', () => {
  test('renames a player for everyone', () => {
    const { game: after, out } = act(game(), bob, { action: 'updatePlayerName', name: '<b>Robert</b>' });
    expect(after!.players[1].name).toBe('Robert');
    expect(actions(out)).toEqual(['playerNameUpdated']);
  });

  test('refuses an empty name or a stranger', () => {
    expect(act(game(), bob, { action: 'updatePlayerName', name: ' ' }).out[0].message.message).toBe('Player name is required.');
    expect(act(game(), 'session-zed', { action: 'updatePlayerName', name: 'Zed' }).out[0].message.message).toBe(
      'Player not found in game.',
    );
  });

  test('a heartbeat gets the current hint for a guesser only', () => {
    const round = inProgress({}, 'rocket');
    expect(act(round, bob, { action: 'heartbeat' }).out[0].message).toEqual({ action: 'heartbeatAck', currentHint: '_ _ _ _ _ _' });
    expect(act(round, ann, { action: 'heartbeat' }).out[0].message).toEqual({ action: 'heartbeatAck' });
  });

  test('a client calling time only hurries the server clock along', () => {
    expect(act(inProgress({}, 'rocket'), bob, { action: 'timeUp' }).out).toEqual([]);
    expect(actions(act(inProgress({}, 'rocket'), bob, { action: 'updateHint' }, T0 + 60_000).out)).toContain('timeUp');
  });

  test('a no-op leaves the game as it was, updatedAt included', () => {
    const before = inProgress({}, 'rocket');
    expect(act(before, bob, { action: 'timeUp' }, T0 + 5).game).toEqual(before);
  });

  test('stripTags leaves no tag behind, even when they nest', () => {
    expect(stripTags('<scr<b>ipt>x</script>')).not.toMatch(/<[^>]*>/);
  });

  test('random names read like a person', () => {
    expect(randomName(() => 0)).toBe('Sunny Mango 10');
  });
});
