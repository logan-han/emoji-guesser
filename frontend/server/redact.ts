import type { Game, Message, Player } from './types.js';

type View = Omit<Game, 'ownerSessionId' | 'secretWord' | 'wordOptions' | 'players' | 'spectators'> & {
  ownerSessionId?: string;
  players: Partial<Player>[];
  spectators: Partial<Player>[];
};

/**
 * One recipient's copy of a game. Session ids work as passwords, so each client only sees its
 * own; the secret word and the word options reach the describer in their own messages instead.
 */
export function viewFor(game: Game, session: string | null): View {
  const { ownerSessionId, secretWord: _word, wordOptions: _options, ...rest } = game;
  const mine = ({ sessionId, ...member }: Player) => (sessionId === session ? { sessionId, ...member } : member);
  return {
    ...rest,
    ...(ownerSessionId === session ? { ownerSessionId } : {}),
    players: game.players.map(mine),
    spectators: game.spectators.map(mine),
  };
}

export function redact(message: Message, session: string | null): Message {
  const copy: Message = { ...message };
  if (copy.game) copy.game = viewFor(copy.game as Game, session);
  if (Array.isArray(copy.games)) copy.games = (copy.games as Game[]).map((game) => viewFor(game, session));
  return copy;
}
