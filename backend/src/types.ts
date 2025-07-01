export interface Player {
  connectionId: string;
  sessionId?: string;
  name: string;
  score: number;
  joinedAt: string;
  lastSeen?: string;
}

export interface Game {
  gameId: string;
  ownerId: string;
  players: Player[];
  gameState: 'WAITING' | 'IN_PROGRESS' | 'ENDED';
  currentRound?: number;
  maxRounds?: number;
  currentDescriberIndex?: number;
  secretWord?: string;
  wordOptions?: string[]; // 3 words to choose from
  turnState?: 'CHOOSING_WORD' | 'DESCRIBING';
  turnStartTime?: string;
  timeLimit: number;
  createdAt: string;
  endedAt?: string;
  currentHint?: string; // Current hint being displayed
}

export interface WebSocketMessage {
  action: string;
  gameId?: string;
  word?: string;
  guess?: string;
  emoji?: string;
  name?: string;
  sessionId?: string;
  playerName?: string;
  [key: string]: any;
}

export interface GameSettings {
  timeLimit: number;
  maxPlayers: number;
  allowSpectators: boolean;
}
