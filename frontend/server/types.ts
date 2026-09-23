export type GameState = 'WAITING' | 'IN_PROGRESS' | 'ENDED';
export type TurnState = 'CHOOSING_WORD' | 'DESCRIBING';

export interface Player {
  /** Public id every client sees; stays put while the session stays in the game. */
  connectionId: string;
  /** The client's own secret. Stripped from everyone else's copy of the game. */
  sessionId: string;
  name: string;
  score: number;
  joinedAt: string;
  isSpectator?: boolean;
  wantsToPlayAgain?: boolean;
  isOwner?: boolean;
}

export interface Game {
  gameId: string;
  /** The owner's connectionId. */
  ownerId: string;
  ownerSessionId: string;
  players: Player[];
  spectators: Player[];
  gameState: GameState;
  isPublic: boolean;
  timeLimit: number;
  maxRounds: number;
  currentRound?: number;
  currentDescriberIndex?: number;
  turnState?: TurnState;
  turnStartTime?: string;
  wordOptions?: string[];
  secretWord?: string;
  currentHint?: string;
  createdAt: string;
  updatedAt: string;
  endedAt?: string;
}

/** What the clients receive; the same shapes the API Gateway socket used to carry. */
export type Message = { action: string; [key: string]: unknown };

/** Who a message is for, by session id; `all` is everyone in the game when it is delivered. */
export type Audience = { all: true } | { only: string[] } | { except: string[] };

export interface Outgoing {
  to: Audience;
  message: Message;
}

export const everyone: Audience = { all: true };
export const only = (...sessions: string[]): Audience => ({ only: sessions });
export const except = (...sessions: string[]): Audience => ({ except: sessions });

export function reaches(audience: Audience, session: string): boolean {
  if ('only' in audience) return audience.only.includes(session);
  if ('except' in audience) return !audience.except.includes(session);
  return true;
}
