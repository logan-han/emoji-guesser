import React, { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import './App.css';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { playSound } from './sounds';
import { supabase } from './supabase';

interface Player {
  connectionId: string;
  sessionId?: string;
  name: string;
  score: number;
  wantsToPlayAgain?: boolean;
  isSpectator?: boolean;
}

interface Game {
  gameId: string;
  ownerId: string;
  ownerSessionId?: string;
  players: Player[];
  spectators?: Player[];
  gameState: 'WAITING' | 'IN_PROGRESS' | 'ENDED';
  currentRound?: number;
  currentDescriberIndex?: number;
  secretWord?: string;
  wordOptions?: string[];
  turnState?: 'CHOOSING_WORD' | 'DESCRIBING';
  timeLimit?: number;
  maxRounds?: number;
  turnStartTime?: string;
  currentHint?: string;
}

interface Message {
  text: string;
  type: 'guess' | 'system' | 'emoji';
  timestamp: number;
}

// WebSocket message types
interface WebSocketOutgoingMessage {
  action: string;
  gameId?: string;
  sessionId?: string;
  playerName?: string;
  word?: string;
  guess?: string;
  emoji?: string;
  timeLimit?: number;
  maxRounds?: number;
  isPublic?: boolean;
  name?: string;
}

// WebSocket incoming message type - server responses have dynamic structure based on action
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WebSocketIncomingMessage = {
  action: string;
  [key: string]: any; // Server responses have varying shapes based on action type
}

const PLAYER_NAME_ADJECTIVES = [
  'Sunny',
  'Lucky',
  'Pixel',
  'Cosmic',
  'Jolly',
  'Neon',
  'Clever',
  'Zesty',
];

const PLAYER_NAME_NOUNS = [
  'Mango',
  'Panda',
  'Rocket',
  'Waffle',
  'Noodle',
  'Comet',
  'Puzzle',
  'Sprout',
];

// Repeat until stable so nested markup such as `<<b>b>` cannot survive a single pass
const stripHtmlTags = (value: string): string => {
  let previous: string;
  let current = value;
  do {
    previous = current;
    current = current.replace(/<[^>]*>/g, '');
  } while (current !== previous);
  return current;
};

// Session IDs authenticate reconnects, so they must come from a CSPRNG
const generateSessionId = (): string => {
  if (typeof crypto === 'undefined') {
    throw new Error('Secure random number generation is unavailable');
  }
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const generateRandomPlayerName = (): string => {
  const adjective = PLAYER_NAME_ADJECTIVES[Math.floor(Math.random() * PLAYER_NAME_ADJECTIVES.length)];
  const noun = PLAYER_NAME_NOUNS[Math.floor(Math.random() * PLAYER_NAME_NOUNS.length)];
  const suffix = Math.floor(10 + Math.random() * 90);
  return `${adjective} ${noun} ${suffix}`;
};

const avatarColors = ['var(--tomato)', 'var(--teal)', 'var(--gold)', 'var(--plum)', 'var(--sage)'];

const getInitials = (name: string): string => (
  name
    .split(' ')
    .map(part => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?'
);

const formatTime = (seconds: number | null): string => {
  const safeSeconds = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, '0');
  const remainder = (safeSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainder}`;
};

const App: React.FC = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
  const [isSpectator, setIsSpectator] = useState(false);
  const [isDescriber, setIsDescriber] = useState(false);
  const [isChoosingWord, setIsChoosingWord] = useState(false);
  const [wordOptions, setWordOptions] = useState<string[]>([]);
  const [currentHint, setCurrentHint] = useState<string>('');
  const [secretWord, setSecretWord] = useState('');
  const [emojis, setEmojis] = useState<string[]>([]);
  const [guess, setGuess] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [gameIdInput, setGameIdInput] = useState('');
  const [sessionId, setSessionId] = useState<string>('');
  const [pendingGameId, setPendingGameId] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [publicGames, setPublicGames] = useState<Game[]>([]);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [timeLimit, setTimeLimit] = useState<number>(120); // 2 minutes in seconds
  const [maxRounds, setMaxRounds] = useState<number>(2);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  const [chooseWordTimeLeft, setChooseWordTimeLeft] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastGuessTime, setLastGuessTime] = useState<number>(0); // Rate limiting for guesses
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0); // Trigger WebSocket reconnection
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const connectionIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>('');
  const roundTimerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeUpSentRef = useRef<boolean>(false); // Track if timeUp was already sent for current round
  const activeRoundTimerKeyRef = useRef<string | null>(null);
  const pendingTimeoutsRef = useRef<NodeJS.Timeout[]>([]); // Track pending timeouts for cleanup
  const reconnectAttemptsRef = useRef<number>(0);
  const seenEventIdsRef = useRef<Set<string>>(new Set());
  const maxReconnectAttempts = 5;

  // Input validation helpers
  const sanitizePlayerName = (name: string): string => {
    // Remove HTML tags, limit length, trim whitespace
    return stripHtmlTags(name).trim().slice(0, 20);
  };

  const sanitizeGuess = (guess: string): string => {
    // Remove HTML tags, limit length, normalize
    return stripHtmlTags(guess).trim().toLowerCase().slice(0, 50);
  };

  const isValidPlayerName = (name: string): boolean => {
    const sanitized = sanitizePlayerName(name);
    return sanitized.length >= 1 && sanitized.length <= 20;
  };

  // Clear error after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  // Load saved player data on mount
  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    connectionIdRef.current = connectionId;
  }, [connectionId]);

  const updateConnectionId = useCallback((nextConnectionId: string | null) => {
    connectionIdRef.current = nextConnectionId;
    setConnectionId(nextConnectionId);
  }, []);

  // Load saved player data on mount
  useEffect(() => {
    const savedSessionId = sessionStorage.getItem('emoji-guesser-session');
    const savedPlayerName = localStorage.getItem('emoji-guesser-player-name');
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    
    if (savedSessionId) {
      sessionIdRef.current = savedSessionId;
      setSessionId(savedSessionId);
    } else {
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);
      sessionIdRef.current = newSessionId;
      sessionStorage.setItem('emoji-guesser-session', newSessionId);
    }
    
    const nextPlayerName = savedPlayerName || generateRandomPlayerName();
    setPlayerName(nextPlayerName);
    if (!savedPlayerName) {
      localStorage.setItem('emoji-guesser-player-name', nextPlayerName);
    }

    if (gameId) {
      setGameIdInput(gameId);
      setPendingGameId(gameId);
    }
  }, []);

  useEffect(() => {
    // Only create WebSocket if we have a sessionId
    if (!sessionId) return;

    // Replace with your actual WebSocket endpoint
    const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
    const newWs = new WebSocket(wsUrl);
    setWs(newWs);

    newWs.onopen = () => {
      setConnected(true);
      reconnectAttemptsRef.current = 0; // Reset on successful connection
      setErrorMessage(null); // Clear any connection error
      console.log('Connected to WebSocket');

      const urlParams = new URLSearchParams(window.location.search);
      const gameId = urlParams.get('gameId');
      if (gameId) {
        newWs.send(JSON.stringify({
          action: 'joinGame',
          gameId,
          sessionId,
          playerName: playerName || generateRandomPlayerName()
        }));
        setPendingGameId(null);
      }
    };

    newWs.onclose = () => {
      setConnected(false);
      console.log('Disconnected from WebSocket');

      // Attempt reconnection with exponential backoff
      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current++;
        console.log(`Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`);
        const reconnectTimeout = setTimeout(() => {
          // Trigger reconnection
          setReconnectTrigger(t => t + 1);
        }, delay);
        pendingTimeoutsRef.current.push(reconnectTimeout);
      } else {
        setErrorMessage('Connection lost. Please refresh the page to reconnect.');
      }
    };

    newWs.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
      setErrorMessage('Connection error. Retrying...');
    };

    newWs.onmessage = (event) => {
      const data = JSON.parse(event.data);
      handleMessage(data);
    };

    return () => {
      newWs.close();
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      // Clean up all pending timeouts
      pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
      pendingTimeoutsRef.current = [];
      clearRoundTimer(); // Clean up timer on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, reconnectTrigger]); // Reconnect when sessionId changes or reconnection is triggered

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = useCallback((message: WebSocketOutgoingMessage) => {
    if (ws && connected) {
      ws.send(JSON.stringify(message));
    }
  }, [ws, connected]);

  const fetchPublicGames = useCallback(() => {
    // Request public games list through WebSocket
    if (ws && connected) {
      sendMessage({ action: 'listPublicGames' });
    }
  }, [ws, connected, sendMessage]);

  const clearRoundTimer = useCallback(() => {
    if (roundTimerIntervalRef.current) {
      clearInterval(roundTimerIntervalRef.current);
      roundTimerIntervalRef.current = null;
    }
    pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
    pendingTimeoutsRef.current = [];
    activeRoundTimerKeyRef.current = null;
    timeUpSentRef.current = false;
    setRoundTimeLeft(null);
  }, []);

  // Fetch public games when connected and periodically refresh
  useEffect(() => {
    if (connected && ws && !game) {
      // Fetch immediately when connected
      fetchPublicGames();
      
      // Set up periodic refresh every 5 seconds, but only when not in a game
      const interval = setInterval(() => {
        fetchPublicGames();
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [connected, ws, fetchPublicGames, game]);

  const startRoundTimer = useCallback((gameState: Game) => {
    if (roundTimerIntervalRef.current) {
      clearInterval(roundTimerIntervalRef.current);
      roundTimerIntervalRef.current = null;
    }

    const roundTimerKey = `${gameState.gameId}:${gameState.turnStartTime || ''}`;
    if (activeRoundTimerKeyRef.current !== roundTimerKey) {
      pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
      pendingTimeoutsRef.current = [];
      timeUpSentRef.current = false;
      activeRoundTimerKeyRef.current = roundTimerKey;
    }

    setRoundTimeLeft(null);

    if (gameState.turnStartTime && gameState.timeLimit) {
      const startTime = new Date(gameState.turnStartTime).getTime();
      const now = Date.now();
      const elapsed = Math.floor((now - startTime) / 1000);
      const timeLeft = Math.max(0, gameState.timeLimit - elapsed);

      setRoundTimeLeft(timeLeft);

      if (timeLeft > 0) {
        const interval = setInterval(() => {
          setRoundTimeLeft(prev => {
            if (prev === null || prev <= 1) {
              // Clear the timer when time is up
              clearInterval(interval);
              if (roundTimerIntervalRef.current === interval) {
                roundTimerIntervalRef.current = null;
              }
              setRoundTimeLeft(0);

              // Send timeUp only once per round to avoid race condition
              if (gameState.gameId && !timeUpSentRef.current) {
                timeUpSentRef.current = true;
                sendMessage({ action: 'timeUp', gameId: gameState.gameId });

                // Single retry after 1 second in case of network issue (server deduplicates)
                const retryTimeout = setTimeout(() => {
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                }, 1000);
                pendingTimeoutsRef.current.push(retryTimeout);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        roundTimerIntervalRef.current = interval;
      } else {
        // Time already up when starting timer
        setRoundTimeLeft(0);
        if (gameState.gameId && !timeUpSentRef.current) {
          timeUpSentRef.current = true;
          sendMessage({ action: 'timeUp', gameId: gameState.gameId });
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendMessage]);

  // Heartbeat that includes gameId when in game, or basic heartbeat when not in game
  useEffect(() => {
    if (ws && connected) {
      const heartbeatInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const heartbeatMessage = game && game.gameId ? 
            { action: 'heartbeat', sessionId, gameId: game.gameId } :
            { action: 'heartbeat', sessionId };
          
          ws.send(JSON.stringify(heartbeatMessage));
        }
      }, 5000); // Every 5 seconds
      
      heartbeatIntervalRef.current = heartbeatInterval;
      
      return () => {
        clearInterval(heartbeatInterval);
        heartbeatIntervalRef.current = null;
      };
    }
  }, [game, ws, connected, sessionId]);

  useEffect(() => {
    // Only run hint updates if game is actively being described and not ended
    if (game && game.gameState === 'IN_PROGRESS' && game.turnState === 'DESCRIBING' && game.gameId) {
      // Since heartbeat now handles regular updates every 5 seconds, we can reduce frequency here
      // This provides additional updates for smoother progression during active play
      const hintInterval = setInterval(() => {
        sendMessage({ action: 'updateHint', gameId: game.gameId });
      }, 10000); // Update hint every 10 seconds (less frequent since heartbeat is every 5s)
      
      // In the final 10 seconds, update more frequently
      let aggressiveInterval: NodeJS.Timeout | null = null;
      const timeLeft = roundTimeLeft;
      if (timeLeft !== null && timeLeft <= 10) {
        aggressiveInterval = setInterval(() => {
          sendMessage({ action: 'updateHint', gameId: game.gameId });
        }, 2000); // Every 2 seconds in the final 10 seconds
      }
      
      return () => {
        clearInterval(hintInterval);
        if (aggressiveInterval) {
          clearInterval(aggressiveInterval);
        }
      };
    }
  }, [game, sendMessage, roundTimeLeft]);

  useEffect(() => {
    if (!supabase || !game?.gameId) {
      return;
    }

    const supabaseClient = supabase;
    const channel = supabaseClient
      .channel(`game:${game.gameId}`)
      .on('broadcast', { event: 'game_status' }, (payload) => {
        const updatedGame = payload.payload as Game | undefined;
        if (!updatedGame || updatedGame.gameId !== game.gameId) {
          return;
        }

        setGame(updatedGame);
        syncConnectionIdFromGame(updatedGame);
        syncRoleFromGame(updatedGame);

        if (updatedGame.gameState === 'IN_PROGRESS' && updatedGame.turnState === 'DESCRIBING') {
          if (updatedGame.currentHint !== undefined) {
            setCurrentHint(updatedGame.currentHint);
          }
          startRoundTimer(updatedGame);
        }

        if (updatedGame.gameState === 'ENDED') {
          setIsDescriber(false);
          setIsChoosingWord(false);
          setSecretWord('');
          setCurrentHint('');
          setWordOptions([]);
          setEmojis([]);
          clearRoundTimer();
        }
      })
      .on('broadcast', { event: 'game_event' }, (payload) => {
        handleMessage(payload.payload as WebSocketIncomingMessage);
      })
      .subscribe();

    return () => {
      supabaseClient.removeChannel(channel);
    };
    // handleMessage intentionally stays outside the dependency list so this subscription
    // is recreated only when the active game channel changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.gameId, startRoundTimer, clearRoundTimer]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    if (game) {
      sendMessage({ action: 'submitEmoji', gameId: game.gameId, emoji: emojiData.emoji });
    }
  };

  const isCurrentPlayer = (player: Player) => {
    const currentConnectionId = connectionIdRef.current || connectionId;
    const currentSessionId = sessionIdRef.current || sessionId;
    return player.connectionId === currentConnectionId ||
           Boolean(currentSessionId && player.sessionId === currentSessionId);
  };

  const isCurrentDescriberForGame = (nextGame?: Game) => {
    if (!nextGame || nextGame.currentDescriberIndex === undefined) return false;
    const describer = nextGame.players[nextGame.currentDescriberIndex];
    return Boolean(describer && isCurrentPlayer(describer));
  };

  const syncConnectionIdFromGame = (nextGame?: Game) => {
    const currentSessionId = sessionIdRef.current || sessionId;
    if (!nextGame || !currentSessionId) return;
    const currentPlayer = nextGame.players.find(player => player.sessionId === currentSessionId);
    const currentSpectator = nextGame.spectators?.find(player => player.sessionId === currentSessionId);
    const currentConnectionId = currentPlayer?.connectionId || currentSpectator?.connectionId;
    if (currentConnectionId) {
      updateConnectionId(currentConnectionId);
    }
  };

  const syncRoleFromGame = (nextGame?: Game) => {
    if (!nextGame) return;

    if (nextGame.gameState !== 'IN_PROGRESS') {
      setIsDescriber(false);
      setIsChoosingWord(false);
      setSecretWord('');
      return;
    }

    if (nextGame.turnState === 'DESCRIBING') {
      const nextIsDescriber = isCurrentDescriberForGame(nextGame);
      setIsDescriber(nextIsDescriber);
      if (!nextIsDescriber) {
        setSecretWord('');
      }
    } else if (nextGame.turnState === 'CHOOSING_WORD') {
      setIsDescriber(false);
    }
  };

  const handleMessage = (data: WebSocketIncomingMessage) => {
    if (data.eventId) {
      if (seenEventIdsRef.current.has(data.eventId)) {
        return;
      }
      seenEventIdsRef.current.add(data.eventId);
      if (seenEventIdsRef.current.size > 200) {
        const firstEventId = seenEventIdsRef.current.values().next().value;
        if (firstEventId !== undefined) {
          seenEventIdsRef.current.delete(firstEventId);
        }
      }
    }

    switch (data.action) {
      case 'connected':
        updateConnectionId(data.connectionId);
        break;
      case 'gameCreated':
        setGame(data.game);
        updateConnectionId(data.game.ownerId);
        setIsLoading(false);
        console.log('Game created:', data.game);
        window.history.pushState({}, '', `?gameId=${data.game.gameId}`);
        break;
      case 'playerJoined':
        playSound('playerJoined');
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        setIsLoading(false);
        if (data.game.gameState === 'IN_PROGRESS') {
          startRoundTimer(data.game);
        }
        break;
      case 'spectatorJoined':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        setIsSpectator(true);
        break;
      case 'playerNameUpdated':
      case 'playerReconnected':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        if (data.action === 'playerReconnected') {
          // Don't show message for own reconnection
        }
        console.log('Player joined/updated/reconnected:', data.game);
        break;
      case 'gameStarted':
        playSound('gameStart');
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        setIsLoading(false);
        setEmojis([]); // Clear emojis from previous rounds
        setMessages([
          {
            text: `🎮 Game started! Round ${data.game.currentRound} begins.`,
            type: 'system',
            timestamp: Date.now()
          }
        ]); // Clear messages and add start message
        console.log('Game started:', data.game);
        break;
      case 'chooseWord':
        setIsChoosingWord(true);
        setIsDescriber(false);
        setWordOptions(data.wordOptions);
        setChooseWordTimeLeft(10);

        const wordChoiceTimer = setInterval(() => {
          setChooseWordTimeLeft(prev => {
            if (prev === null || prev <= 1) {
              clearInterval(wordChoiceTimer);
              if (wordOptions.length > 0) {
                chooseWord(wordOptions[0]);
              }
              return 0;
            }
            return prev - 1;
          });
        }, 1000);

        setMessages(prev => [...prev, { 
          text: `📝 Choose a word to describe from the options below!`, 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        break;
      case 'describeWord':
        setIsDescriber(true);
        setIsChoosingWord(false);
        setSecretWord(data.word);
        setEmojis([]); // Clear previous emojis
        setMessages(prev => [...prev, { 
          text: `🎨 You are the Describer! Start describing the word "${data.word}" with emojis.`, 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        // Start timer when describing begins - use the game data from the server
        if (data.game) {
          setGame(data.game);
          syncConnectionIdFromGame(data.game);
          startRoundTimer(data.game);
        }
        break;
      case 'turnStarted':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        setIsChoosingWord(false);
        setEmojis([]); // Clear emojis for new turn
        setCurrentHint(data.hint || '');
        if (data.game.currentDescriberIndex !== undefined && data.game.players[data.game.currentDescriberIndex]) {
          const describerName = data.game.players[data.game.currentDescriberIndex].name;
          setMessages(prev => [...prev, { 
            text: `🎯 ${describerName} is now describing! Start guessing!`, 
            type: 'system', 
            timestamp: Date.now() 
          }]);
        }
        // Start the round timer
        startRoundTimer(data.game);
        break;
      case 'hintUpdated':
        setCurrentHint(data.hint);
        break;
      case 'newEmoji':
        playSound('emojiSelect');
        setEmojis(prev => [...prev, data.emoji]);
        break;
      case 'emojisCleared':
        setEmojis([]);
        break;
      case 'newGuess':
        playSound('newGuess');
        setMessages(prev => [...prev, { text: data.text, type: 'guess', timestamp: Date.now() }]);
        break;
      case 'wordGuessed':
        playSound('correctGuess');
        setMessages(prev => [...prev, {
          text: `🎉 ${data.guesserName} guessed correctly! The word was: ${data.word}`,
          type: 'system',
          timestamp: Date.now()
        }]);
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        // Clear timer when word is guessed
        clearRoundTimer();
        break;
      case 'nextTurn':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        setIsDescriber(false);
        setIsChoosingWord(false);
        setSecretWord('');
        setCurrentHint('');
        setWordOptions([]);
        setEmojis([]);
        // Clear timer for next turn
        clearRoundTimer();
        if (data.game.currentRound && data.game.maxRounds) {
          setMessages(prev => [...prev, { 
            text: `🔄 Round ${data.game.currentRound} of ${data.game.maxRounds} - Next turn!`, 
            type: 'system', 
            timestamp: Date.now() 
          }]);
        }
        break;
      case 'gameEnded':
        playSound('gameEnd');
        setGame(data.game);
        setIsDescriber(false);
        setIsChoosingWord(false);
        setSecretWord('');
        setCurrentHint('');
        setWordOptions([]);
        setEmojis([]);
        clearRoundTimer(); // Clear timer when game ends
        setMessages(prev => [...prev, { 
          text: `🏁 Game ended! Check the final scores above.`, 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        break;
      case 'gameRestarted':
        setGame(data.game);
        setIsDescriber(false);
        setIsChoosingWord(false);
        setSecretWord('');
        setCurrentHint('');
        setWordOptions([]);
        setEmojis([]);
        setGuess('');
        setMessages([]);
        clearRoundTimer();
        if (data.isNewOwner) {
          setMessages(prev => [...prev, { 
            text: '👑 You are now the game owner!', 
            type: 'system', 
            timestamp: Date.now() 
          }]);
        } else if (data.message) {
          setMessages(prev => [...prev, { 
            text: data.message, 
            type: 'system', 
            timestamp: Date.now() 
          }]);
        }
        break;
      case 'playerRejoined':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        setMessages(prev => [...prev, { 
          text: `🔄 ${data.rejoinedPlayer} has rejoined the game!`, 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        break;
      case 'timeUp':
        playSound('timeUp');
        setMessages(prev => [...prev, { 
          text: data.message || "⏰ Time's up! Moving to next turn...", 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        if (data.word) {
          setMessages(prev => [...prev, { 
            text: `💡 The word was: ${data.word}`, 
            type: 'system', 
            timestamp: Date.now() 
          }]);
        }
        clearRoundTimer();
        break;
      case 'playerLeft':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        syncRoleFromGame(data.game);
        // Clear round timer if the game ended due to player disconnect
        if (data.game.gameState === 'ENDED') {
          clearRoundTimer();
        }
        setMessages(prev => [...prev, { 
          text: data.message || 'A player left the game', 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        break;
      case 'error':
        setErrorMessage(data.message || 'An error occurred');
        setIsLoading(false);
        break;
      case 'heartbeatAck':
        // Heartbeat acknowledged, connection is alive
        // If heartbeat includes a hint update, apply it
        if (data.currentHint !== undefined) {
          setCurrentHint(data.currentHint);
        }
        break;
      case 'publicGamesList':
        setPublicGames(data.games || []);
        break;
      case 'statusMessage':
        setMessages(prev => [...prev, { 
          text: data.message, 
          type: 'system', 
          timestamp: data.timestamp || Date.now() 
        }]);
        break;
      default:
        console.log('Unknown message:', data);
    }
  };

  const createGame = () => {
    playSound('buttonClick');
    const sanitizedName = sanitizePlayerName(playerName) || generateRandomPlayerName();
    setIsLoading(true);
    setPlayerName(sanitizedName);
    localStorage.setItem('emoji-guesser-player-name', sanitizedName);
    sendMessage({ action: 'createGame', sessionId, playerName: sanitizedName, timeLimit, maxRounds, isPublic });
  };

  const startGame = () => {
    playSound('buttonClick');
    setIsLoading(true);
    if (game) sendMessage({ action: 'startGame', gameId: game.gameId, sessionId, timeLimit, maxRounds });
  };

  const joinGameById = (id?: string) => {
    playSound('buttonClick');
    const gameToJoin = id || gameIdInput;
    const sanitizedName = sanitizePlayerName(playerName) || generateRandomPlayerName();
    if (gameToJoin) {
      setIsLoading(true);
      setPlayerName(sanitizedName);
      localStorage.setItem('emoji-guesser-player-name', sanitizedName);
      sendMessage({ action: 'joinGame', gameId: gameToJoin, sessionId, playerName: sanitizedName });
      setPendingGameId(null);
      setGameIdInput('');
    }
  };

  const updatePlayerName = (newName: string) => {
    const sanitizedName = sanitizePlayerName(newName);
    if (!isValidPlayerName(sanitizedName)) {
      // Reset to the current player's name from the game state
      if (game) {
        const currentPlayer = game.players.find(p => isCurrentPlayer(p));
        if (currentPlayer) {
          setPlayerName(currentPlayer.name);
        }
      }
      setEditingName(false);
      setErrorMessage('Name must be 1-20 characters');
      return;
    }

    setPlayerName(sanitizedName);
    localStorage.setItem('emoji-guesser-player-name', sanitizedName);
    if (game) {
      sendMessage({ action: 'updatePlayerName', gameId: game.gameId, name: sanitizedName, sessionId });
    }
    setEditingName(false);
  };

  // Helper function to copy invite link with feedback
  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${window.location.pathname}?gameId=${game?.gameId}`);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Helper function to check if current user is the game owner
  const isGameOwner = () => {
    if (!game) return false;
    // Check if current user is the owner by connectionId or if they're the first player with matching sessionId
    return game.ownerId === connectionId || 
           (sessionId && game.ownerSessionId === sessionId);
  };

  // Helper function to check if a specific player is the game owner
  const isPlayerGameOwner = (player: Player) => {
    if (!game) return false;
    // Check if the player is the owner by connectionId or sessionId
    return game.ownerId === player.connectionId || 
           (player.sessionId && game.ownerSessionId === player.sessionId);
  };

  const handleGuessSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!game || !guess) return;

    // Rate limiting: 500ms between guesses
    const now = Date.now();
    if (now - lastGuessTime < 500) {
      return;
    }

    const sanitizedGuess = sanitizeGuess(guess);
    if (!sanitizedGuess) return;

    setLastGuessTime(now);
    sendMessage({ action: 'submitGuess', gameId: game.gameId, guess: sanitizedGuess });
    setGuess('');
  };

  const chooseWord = (selectedWord: string) => {
    if (game) {
      sendMessage({ action: 'chooseWord', gameId: game.gameId, word: selectedWord });
      setWordOptions([]);
      setIsChoosingWord(false);
    }
  };

  const playAgain = () => {
    if (game) {
      sendMessage({ action: 'restartGame', gameId: game.gameId, sessionId, timeLimit, maxRounds });
    }
  };

  const backToLobby = () => {
    setGame(null);
    setIsLoading(false);
    setIsDescriber(false);
    setIsChoosingWord(false);
    setSecretWord('');
    setCurrentHint('');
    setWordOptions([]);
    setEmojis([]);
    setGuess('');
    setMessages([]);
    clearRoundTimer();
    window.history.pushState({}, '', window.location.pathname);
  };

  const activePlayers = game?.players.filter((p: Player) => p.wantsToPlayAgain !== false) || [];
  const sortedPlayers = [...(game?.players || [])].sort((a, b) => b.score - a.score);
  const currentDescriber = game?.currentDescriberIndex !== undefined
    ? game.players[game.currentDescriberIndex]
    : undefined;
  const hintLetters = currentHint ? currentHint.split('') : [];
  const inviteLink = game ? `${window.location.origin}${window.location.pathname}?gameId=${game.gameId}` : '';
  const statusText = connected ? 'Connected' : reconnectAttemptsRef.current < maxReconnectAttempts ? 'Reconnecting...' : 'Disconnected';
  const roundLabel = game?.currentRound && game?.maxRounds
    ? `Round ${game.currentRound} / ${game.maxRounds}`
    : `Round ${game?.currentRound || 1}`;

  const renderAvatar = (name: string, color = 'var(--accent)', size = 32) => (
    <div className="av" style={{ width: size, height: size, background: color, fontSize: size * 0.4 }}>
      {getInitials(name)}
    </div>
  );

  const renderChatMessage = (msg: Message, index: number) => {
    if (msg.type === 'system') {
      return <div key={index} className="msg system">{msg.text}</div>;
    }

    const [who, ...bodyParts] = msg.text.includes(':') ? msg.text.split(':') : ['Guess', msg.text];
    return (
      <div key={index} className={`msg ${msg.type === 'emoji' ? 'correct' : ''}`}>
        <span className="sr-only">{msg.text}</span>
        <span className="who">{who}</span>
        <span className="body">{bodyParts.join(':').trim() || msg.text}</span>
      </div>
    );
  };

  return (
    <div className="shell app" data-theme="confetti" data-accent="tomato">
      <header className="topbar">
        <button className="brand brand-button" onClick={backToLobby} type="button">
          <div className="brand-mark">🎭</div>
          <div>
            <div className="brand-name">emoji <em>guesser</em></div>
            <div className="brand-tag">Multiplayer · Real-time</div>
            <span className="sr-only">🎮 Emoji Guesser</span>
          </div>
        </button>
        <div className="topbar-right">
          <div className={`conn-pill ${connected ? '' : 'off'}`}>
            <span className="conn-dot" />
            <span>{statusText}</span>
          </div>
          <span className="sr-only">Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</span>
          {!connected && reconnectAttemptsRef.current >= maxReconnectAttempts && (
            <button
              onClick={() => {
                reconnectAttemptsRef.current = 0;
                setReconnectTrigger(t => t + 1);
              }}
              className="btn btn-ghost btn-sm"
            >
              Reconnect
            </button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div className="error-notification" role="alert">
          <span>{errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="btn btn-ghost btn-sm" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {!game && (
        <div data-screen-label="01 Lobby">
          <section className="hero">
            <div>
              <p className="eyebrow">Quick game · No download</p>
              <h1 className="hero-title">
                Describe it<br />
                with <em>emoji.</em>
                <br />Beat your friends.
              </h1>
              <p className="hero-sub">
                One player gets a secret word. They describe it using only emoji.
                Everyone else races to guess. Best score after the final round wins.
              </p>
            </div>
            <picture className="hero-art">
              <source srcSet="/images/emoji-guesser-hero.webp" type="image/webp" />
              <img
                src="/images/emoji-guesser-hero.png"
                alt="Emoji clue cards, a timer, and player pieces arranged on a tabletop"
                width="900"
                height="900"
              />
            </picture>
          </section>

          <div className="lobby-grid">
            <div className="card create-card">
              <p className="eyebrow">Start playing</p>
              <h2 className="section-title">Create a <em>new room</em></h2>

              <div className="field form-spacer">
                <label className="field-label" htmlFor="lobby-player-name">Your name</label>
                <input
                  id="lobby-player-name"
                  type="text"
                  placeholder="Enter your name"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="input"
                  minLength={1}
                  maxLength={20}
                  autoComplete="nickname"
                />
                {pendingGameId && <small>Joining game {pendingGameId}</small>}
              </div>

              <div className="field">
                <label className="field-label">Visibility</label>
                <div className="segmented" role="tablist" aria-label="Game visibility">
                  <button type="button" role="tab" aria-selected={isPublic} onClick={() => setIsPublic(true)}>
                    <span>🌍</span> Public Game
                  </button>
                  <button type="button" role="tab" aria-selected={!isPublic} onClick={() => setIsPublic(false)}>
                    <span>🔒</span> Private Game
                  </button>
                </div>
                <label className="sr-only">
                  <input type="radio" name="gameType" value="private" checked={!isPublic} onChange={() => setIsPublic(false)} />
                  Private Game
                </label>
                <label className="sr-only">
                  <input type="radio" name="gameType" value="public" checked={isPublic} onChange={() => setIsPublic(true)} />
                  Public Game
                </label>
              </div>

              <div className="row-2">
                <div className="field field-compact">
                  <label className="field-label" htmlFor="lobby-rounds">Rounds</label>
                  <select id="lobby-rounds" className="input" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))}>
                    {[2, 3, 4, 5].map(rounds => <option key={rounds} value={rounds}>{rounds} rounds</option>)}
                  </select>
                </div>
                <div className="field field-compact">
                  <label className="field-label" htmlFor="lobby-time-limit">Round time</label>
                  <select id="lobby-time-limit" className="input" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))}>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={180}>3 minutes</option>
                    <option value={240}>4 minutes</option>
                    <option value={300}>5 minutes</option>
                  </select>
                </div>
              </div>

              <button onClick={createGame} disabled={!connected || isLoading} className="btn btn-primary btn-lg btn-block">
                {isLoading ? 'Creating...' : 'Create New Game'} <span aria-hidden="true">→</span>
              </button>

              <div className="divider">or join with code</div>

              <div className="join-row">
                <input
                  type="text"
                  placeholder="Enter Game ID"
                  value={gameIdInput}
                  onChange={(e) => setGameIdInput(e.target.value.toUpperCase())}
                  className="input mono"
                />
                <button onClick={() => joinGameById()} disabled={!connected || !gameIdInput || isLoading} className="btn">
                  {isLoading ? 'Joining...' : 'Join Game'}
                </button>
              </div>
            </div>

            <div className="card public-card">
              <div className="public-card-header">
                <div>
                  <p className="eyebrow eyebrow-flush">Browse</p>
                  <h3 className="section-title section-title-sm">Public rooms</h3>
                </div>
                <div className="meta">
                  <span className="live-indicator">Live</span>
                  <span>{publicGames.length} open</span>
                </div>
              </div>
              {publicGames.length > 0 ? (
                <div className="games-list">
                  {publicGames.map((publicGame) => (
                    <button
                      type="button"
                      key={publicGame.gameId}
                      className="game-row"
                      onClick={() => joinGameById(publicGame.gameId)}
                      disabled={!connected || isLoading}
                    >
                      <div className="game-avatar">🎭</div>
                      <div className="game-meta">
                        <div className="id">#{publicGame.gameId}</div>
                        <div className="title">{publicGame.players[0]?.name || 'Open room'}</div>
                      </div>
                      <div className="player-stack">
                        {publicGame.players.slice(0, 3).map((player) => (
                          <div key={player.connectionId || player.name} className="pip" title={player.name}>
                            {getInitials(player.name).slice(0, 1)}
                          </div>
                        ))}
                        <span className="more">{publicGame.players.length}</span>
                      </div>
                      <span className={`status-tag ${publicGame.gameState === 'WAITING' ? 'waiting' : 'playing'}`}>
                        {publicGame.gameState === 'WAITING' ? 'Waiting' : 'Playing'}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <div className="empty-state-mark">🎯</div>
                  <h4>No public rooms</h4>
                  <p>Create a public game to get started.</p>
                </div>
              )}
            </div>
          </div>

          <p className="coffee-note">
            <a href="https://han.life/coffee" target="_blank" rel="noopener noreferrer">☕ Buy me a coffee</a>
          </p>
        </div>
      )}

      {game && game.gameState === 'WAITING' && (
        <div data-screen-label="02 Waiting">
          <span className="sr-only">🎯 Game Lobby</span>
          <span className="sr-only">{game.gameId}</span>
          <section className="round-bar">
            <div className="left">
              <span className="round-pill">Room · {game.gameId}</span>
              <span className="soft-note">Waiting for the host to start</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={backToLobby}>← Leave room</button>
          </section>

          <div className="gl-grid">
            <div>
              <div className="card card-gap">
                <p className="eyebrow">Invite friends</p>
                <h2 className="section-title">Share this <em>link</em></h2>
                <p className="helper-copy">Anyone with the link can join until the game starts.</p>
                <div className="invite-block">
                  <code>{inviteLink}</code>
                  <button className="btn btn-sm" onClick={copyInviteLink}>
                    {copyFeedback ? '✅ Copied!' : 'Copy link'}
                    {!copyFeedback && <span className="sr-only">📋 Copy</span>}
                  </button>
                </div>
                <span className="sr-only">Invite Link:</span>
              </div>

              <div className="card">
                <div className="card-headline">
                  <h3 className="section-title section-title-xs">Players <span>· {activePlayers.length}/8</span></h3>
                  <span className="sr-only">Players ({activePlayers.length})</span>
                  <span className="soft-note">Min 2 to start</span>
                </div>
                {game.players.filter((p: Player) => p.wantsToPlayAgain === false).length > 0 && (
                  <p className="helper-copy">{game.players.filter((p: Player) => p.wantsToPlayAgain === false).length} player(s) waiting to rejoin</p>
                )}
                <div className="players-grid">
                  {activePlayers.map((player, index) => (
                    <div key={player.connectionId || player.name} className={`player-tile ${isCurrentPlayer(player) ? 'you' : ''}`}>
                      {renderAvatar(player.name, isCurrentPlayer(player) ? 'var(--ink)' : avatarColors[index % avatarColors.length], 38)}
                      <div className="player-name-cell">
                        {isCurrentPlayer(player) && editingName ? (
                          <input
                            type="text"
                            value={playerName || player.name}
                            onChange={(e) => setPlayerName(e.target.value)}
                            onBlur={(e) => {
                              const trimmedValue = e.target.value.trim();
                              if (trimmedValue.length > 0) {
                                updatePlayerName(trimmedValue);
                              } else {
                                const latestCurrentPlayer = game.players.find(p => isCurrentPlayer(p));
                                if (latestCurrentPlayer) setPlayerName(latestCurrentPlayer.name);
                                setEditingName(false);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const trimmedValue = e.currentTarget.value.trim();
                                if (trimmedValue) updatePlayerName(trimmedValue);
                              } else if (e.key === 'Escape') {
                                setEditingName(false);
                              }
                            }}
                            placeholder="Enter your name (required)"
                            className="input input-compact"
                            autoFocus
                            minLength={1}
                            maxLength={20}
                          />
                        ) : (
                          <button
                            type="button"
                            className="nm player-name-button"
                            onClick={() => isCurrentPlayer(player) && setEditingName(true)}
                          >
                            {player.name}
                            {isCurrentPlayer(player) && <small className="sr-only"> (click to edit)</small>}
                          </button>
                        )}
                        <div className="sub">
                          {isPlayerGameOwner(player) && <span className="crown" title="Game Host">♛</span>}
                          <span>{isPlayerGameOwner(player) ? 'Host' : 'Ready'}{isCurrentPlayer(player) ? ' · You' : ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {Array.from({ length: Math.max(0, 8 - activePlayers.length) }).map((_, index) => (
                    <div key={`empty-${index}`} className="players-empty-slot">
                      <div className="av">+</div>
                      <div className="sub">Waiting...</div>
                    </div>
                  ))}
                </div>
                {game.spectators && game.spectators.length > 0 && (
                  <div className="spectator-list-compact">
                    <span className="soft-note">Spectators ({game.spectators.length})</span>
                    {game.spectators.map((spectator) => (
                      <span key={spectator.connectionId || spectator.name} className="status-tag">{spectator.name}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="card card-gap">
                <p className="eyebrow">Settings</p>
                <h3 className="section-title section-title-xs">Round rules</h3>
                <div className="settings-list">
                  <div className="row">
                    <div className="label">Total rounds<span className="sub">Each player describes once per round</span></div>
                    <select id="max-rounds" className="input" value={maxRounds} onChange={(e) => setMaxRounds(Number(e.target.value))} disabled={!isGameOwner()}>
                      {[2, 3, 4, 5].map(rounds => <option key={rounds} value={rounds}>{rounds} rounds</option>)}
                    </select>
                  </div>
                  <div className="row">
                    <div className="label">Round time<span className="sub">Per describing turn</span></div>
                    <select id="time-limit" className="input" value={timeLimit} onChange={(e) => setTimeLimit(Number(e.target.value))} disabled={!isGameOwner()}>
                      <option value={60}>1:00</option>
                      <option value={120}>2:00</option>
                      <option value={180}>3:00</option>
                      <option value={240}>4:00</option>
                      <option value={300}>5:00</option>
                    </select>
                  </div>
                  <div className="row">
                    <div className="label">Hint reveals<span className="sub">Letters appear over time</span></div>
                    <span className="status-tag playing">On</span>
                  </div>
                </div>
              </div>

              {isGameOwner() && (
                <button
                  onClick={startGame}
                  disabled={activePlayers.length < 2 || isLoading}
                  className="btn btn-primary btn-lg btn-block"
                >
                  {isLoading ? 'Starting...' : activePlayers.length < 2 ? 'Need at least 2 players' : 'Start Game'} <span aria-hidden="true">→</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {game && game.gameState === 'IN_PROGRESS' && (
        <div data-screen-label={isDescriber ? '03 Game (describer)' : '03 Game (guesser)'}>
          <span className="sr-only">Game in Progress</span>
          {isSpectator && (
            <div className="card spectator-banner">
              <p className="eyebrow">Spectator Mode</p>
              <p className="helper-copy">You've joined a game in progress. You can watch the current round and will join as a player in the next round.</p>
            </div>
          )}

          {isChoosingWord && wordOptions.length > 0 && (
            <div className="word-picker-backdrop">
              <div className="card word-picker-card">
                <div className="word-picker-head">
                  <div>
                    <p className="eyebrow">Your turn to describe</p>
                    <h2 className="section-title">Pick a <em>word</em></h2>
                    <span className="sr-only">Choose a Word to Describe</span>
                  </div>
                  <div className="timer">
                    <span className="label">Choose in</span>
                    <span>0:{(chooseWordTimeLeft || 0).toString().padStart(2, '0')}</span>
                  </div>
                </div>
                <p className="helper-copy">Select one of the words below.</p>
                <div className="word-choices">
                  {wordOptions.map((word, index) => (
                    <button key={word} onClick={() => chooseWord(word)} className="word-choice">
                      <span className="num">0{index + 1}</span>
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <section className="round-bar">
            <div className="left">
              <span className="round-pill">{roundLabel}</span>
              <div className="round-progress" aria-label="Round progress">
                {Array.from({ length: game.maxRounds || maxRounds }).map((_, index) => (
                  <span
                    key={index}
                    className={`dot ${game.currentRound && index + 1 < game.currentRound ? 'done' : ''} ${game.currentRound === index + 1 ? 'current' : ''}`}
                  />
                ))}
              </div>
              <span className="soft-note">
                {isDescriber ? "You're describing" : `${currentDescriber?.name || 'Someone'} is describing`}
              </span>
            </div>
            <div className={`timer ${roundTimeLeft !== null && roundTimeLeft <= 30 ? 'warn' : ''}`}>
              <span className="label">Time</span>
              <span>{formatTime(roundTimeLeft ?? game.timeLimit ?? timeLimit)}</span>
            </div>
          </section>

          <div className="stage-grid">
            <div>
              <div className="stage">
                <div className="stage-head">
                  <div className="who">
                    {renderAvatar(isDescriber ? 'You' : currentDescriber?.name || 'Player', 'var(--plum)', 28)}
                    <span><strong>{isDescriber ? 'You' : currentDescriber?.name || 'Player'}</strong> {isDescriber ? 'are describing' : 'is describing'}</span>
                  </div>
                  <span className="stage-count">{emojis.length} emoji played</span>
                </div>
                <div className="canvas">
                  {emojis.length === 0 ? (
                    <div className="canvas-empty">Waiting for emojis...</div>
                  ) : emojis.map((emoji, index) => (
                    <span key={`${emoji}-${index}`} className="canvas-emoji" style={{ animationDelay: `${index * 60}ms` }}>{emoji}</span>
                  ))}
                </div>
                {(currentHint || !isDescriber) && (
                  <div className="hint-rail" aria-label="Word hint">
                    {hintLetters.length > 0 ? hintLetters.map((character, index) => (
                      character === ' '
                        ? <div key={index} className="hint-space" />
                        : <div key={index} className={`hint-letter ${character === '_' ? 'blank' : ''}`}>{character === '_' ? '_' : character}</div>
                    )) : <div className="canvas-empty">Hint pending</div>}
                  </div>
                )}
              </div>

              {isDescriber && (
                <div className="describer-card">
                  <p className="eyebrow">Your secret word</p>
                  <div className="secret-word-display"><em>{secretWord}</em></div>
                  <p className="helper-copy">Use the picker to describe it with emoji. The quickbar shows emoji already played this turn.</p>
                  <div className="emoji-quickbar">
                    {emojis.length > 0 ? emojis.slice(-12).map((emoji, index) => (
                      <button key={`${emoji}-quick-${index}`} className="emoji-key" onClick={() => onEmojiClick({ emoji } as EmojiClickData)}>{emoji}</button>
                    )) : <span className="quickbar-empty">Played emoji will appear here.</span>}
                  </div>
                  <div className="describer-actions">
                    <button onClick={() => { setEmojis([]); if (game) sendMessage({ action: 'clearEmojis', gameId: game.gameId }); }} className="btn btn-ghost btn-sm">Clear all</button>
                  </div>
                  <div className="emoji-picker-panel">
                    <EmojiPicker
                      onEmojiClick={onEmojiClick}
                      autoFocusSearch={false}
                      searchPlaceholder="Search emojis..."
                      width="100%"
                      height={400}
                      previewConfig={{ showPreview: false }}
                      skinTonesDisabled
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="sidebar">
              <div className="card scoreboard-card">
                <div className="head">
                  <h3 className="section-title section-title-xxs">Scoreboard</h3>
                  <span className="soft-note">{game.players.length} players</span>
                </div>
                <div className="scoreboard-list">
                  {sortedPlayers.map((player, index) => (
                    <div key={player.connectionId || player.name} className={`score-row ${isCurrentPlayer(player) ? 'you' : ''} ${currentDescriber?.connectionId === player.connectionId ? 'describer' : ''}`}>
                      <span className="rank">#{index + 1}</span>
                      {renderAvatar(player.name, avatarColors[index % avatarColors.length], 32)}
                      <div className="nm">
                        {player.name}
                        {currentDescriber?.connectionId === player.connectionId && <span className="role">· describing</span>}
                        {isCurrentPlayer(player) && <span className="role">· you</span>}
                      </div>
                      <span className="pts">{player.score}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="card chat-card">
                <div className="head">
                  <h3 className="section-title section-title-xxs">Guesses</h3>
                  <span className="soft-note">Live</span>
                </div>
                <div className="chat-stream" ref={messagesEndRef}>
                  {messages.map(renderChatMessage)}
                </div>
                {!isDescriber && !isSpectator && (
                  <form onSubmit={handleGuessSubmit} className="chat-form">
                    <input
                      type="text"
                      value={guess}
                      onChange={(e) => setGuess(e.target.value)}
                      placeholder="Type your guess..."
                      className="input"
                      maxLength={50}
                    />
                    <button type="submit" disabled={!guess} className="btn btn-primary">
                      Guess
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {game && game.gameState === 'ENDED' && (
        <div className="ended-wrap" data-screen-label="04 Results">
          <div className="ended-confetti" aria-hidden="true">
            <span>🎉</span><span>🏆</span><span>✨</span>
          </div>
          <p className="eyebrow ended-eyebrow">Final · {game.maxRounds || maxRounds} rounds played</p>
          <h1 className="ended-title">
            <em>{sortedPlayers.length > 1 ? sortedPlayers[0].name : 'Winner'}</em> takes the crown
          </h1>
          <p className="ended-sub">Great game. {sortedPlayers[0]?.score || 0} points across {game.maxRounds || maxRounds} rounds.</p>
          <span className="sr-only">Final Scores:</span>

          {sortedPlayers.length > 0 && (
            <div className="podium">
              {sortedPlayers[1] && (
                <div className="podium-step second">
                  <div className="medal">🥈</div>
                  <div className="nm">{sortedPlayers[1].name}</div>
                  <div className="pts">{sortedPlayers[1].score} pts</div>
                </div>
              )}
              <div className="podium-step first">
                <div className="medal">🥇</div>
                <div className="nm">{sortedPlayers[0].name}</div>
                <div className="pts">{sortedPlayers[0].score} pts</div>
                <span className="sr-only">{sortedPlayers[0].score}</span>
              </div>
              {sortedPlayers[2] && (
                <div className="podium-step third">
                  <div className="medal">🥉</div>
                  <div className="nm">{sortedPlayers[2].name}</div>
                  <div className="pts">{sortedPlayers[2].score} pts</div>
                </div>
              )}
            </div>
          )}

          <div className="also-ran">
            {sortedPlayers.slice(3).map((player, index) => (
              <div key={player.connectionId || player.name} className="card-flat result-row">
                <span className="rank">#{index + 4}</span>
                {renderAvatar(player.name, 'var(--bg-2)', 28)}
                <span className="name">{player.name} {player.wantsToPlayAgain && '↻'}</span>
                <span className="score">{player.score} pts</span>
              </div>
            ))}
          </div>

          <div className="game-ended-actions">
            <button onClick={playAgain} className="btn btn-primary btn-lg">
              {isGameOwner() ? 'Play Again' : 'Rejoin Game'}
            </button>
            <button onClick={backToLobby} className="btn btn-lg">
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
