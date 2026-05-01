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
  const [isPublic, setIsPublic] = useState<boolean>(false);
  const [publicGames, setPublicGames] = useState<Game[]>([]);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [copyFeedback, setCopyFeedback] = useState<boolean>(false);
  const [timeLimit, setTimeLimit] = useState<number>(120); // 2 minutes in seconds
  const [maxRounds, setMaxRounds] = useState<number>(2);
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  const [chooseWordTimeLeft, setChooseWordTimeLeft] = useState<number | null>(null);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastGuessTime, setLastGuessTime] = useState<number>(0); // Rate limiting for guesses
  const [reconnectTrigger, setReconnectTrigger] = useState<number>(0); // Trigger WebSocket reconnection
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const timeUpSentRef = useRef<boolean>(false); // Track if timeUp was already sent for current round
  const pendingTimeoutsRef = useRef<NodeJS.Timeout[]>([]); // Track pending timeouts for cleanup
  const reconnectAttemptsRef = useRef<number>(0);
  const maxReconnectAttempts = 5;

  // Input validation helpers
  const sanitizePlayerName = (name: string): string => {
    // Remove HTML tags, limit length, trim whitespace
    return name.replace(/<[^>]*>/g, '').trim().slice(0, 20);
  };

  const sanitizeGuess = (guess: string): string => {
    // Remove HTML tags, limit length, normalize
    return guess.replace(/<[^>]*>/g, '').trim().toLowerCase().slice(0, 50);
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
    const savedSessionId = sessionStorage.getItem('emoji-guesser-session');
    const savedPlayerName = localStorage.getItem('emoji-guesser-player-name');
    
    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      // Use crypto.randomUUID() for secure session ID generation
      const newSessionId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      sessionStorage.setItem('emoji-guesser-session', newSessionId);
    }
    
    if (savedPlayerName) {
      setPlayerName(savedPlayerName);
    }
  }, []);

  useEffect(() => {
    // Only create WebSocket if we have a sessionId
    if (!sessionId) return;

    // Replace with your actual WebSocket endpoint
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:3001';
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
        // Send session ID with join request to maintain identity
        newWs.send(JSON.stringify({
          action: 'joinGame',
          gameId,
          sessionId,
          playerName: playerName || undefined
        }));
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
    // Clear any existing timer and pending timeouts
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
    pendingTimeoutsRef.current = [];
    timeUpSentRef.current = false; // Reset for new round
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
              setTimerInterval(null);
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

        setTimerInterval(interval);
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

  const clearRoundTimer = useCallback(() => {
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
    }
    // Clear any pending timeouts
    pendingTimeoutsRef.current.forEach(t => clearTimeout(t));
    pendingTimeoutsRef.current = [];
    setRoundTimeLeft(null);
  }, [timerInterval]);

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

  const syncConnectionIdFromGame = (nextGame?: Game) => {
    if (!nextGame || !sessionId) return;
    const currentPlayer = nextGame.players.find(player => player.sessionId === sessionId);
    const currentSpectator = nextGame.spectators?.find(player => player.sessionId === sessionId);
    const currentConnectionId = currentPlayer?.connectionId || currentSpectator?.connectionId;
    if (currentConnectionId) {
      setConnectionId(currentConnectionId);
    }
  };

  const handleMessage = (data: WebSocketIncomingMessage) => {
    switch (data.action) {
      case 'connected':
        setConnectionId(data.connectionId);
        break;
      case 'gameCreated':
        setGame(data.game);
        setConnectionId(data.game.ownerId);
        setIsLoading(false);
        console.log('Game created:', data.game);
        window.history.pushState({}, '', `?gameId=${data.game.gameId}`);
        break;
      case 'playerJoined':
        playSound('playerJoined');
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        setIsLoading(false);
        if (data.game.gameState === 'IN_PROGRESS') {
          startRoundTimer(data.game);
        }
        break;
      case 'spectatorJoined':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        setIsSpectator(true);
        break;
      case 'playerNameUpdated':
      case 'playerReconnected':
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
        if (data.action === 'playerReconnected') {
          // Don't show message for own reconnection
        }
        console.log('Player joined/updated/reconnected:', data.game);
        break;
      case 'gameStarted':
        playSound('gameStart');
        setGame(data.game);
        syncConnectionIdFromGame(data.game);
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
          startRoundTimer(data.game);
        }
        break;
      case 'turnStarted':
        setGame(data.game);
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
        // Clear timer when word is guessed
        clearRoundTimer();
        break;
      case 'nextTurn':
        setGame(data.game);
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
    setIsLoading(true);
    sendMessage({ action: 'createGame', sessionId, playerName: playerName || undefined, timeLimit, maxRounds, isPublic });
  };

  const startGame = () => {
    playSound('buttonClick');
    setIsLoading(true);
    if (game) sendMessage({ action: 'startGame', gameId: game.gameId, sessionId, timeLimit, maxRounds });
  };

  const joinGameById = (id?: string) => {
    playSound('buttonClick');
    setIsLoading(true);
    const gameToJoin = id || gameIdInput;
    if (gameToJoin) {
      const sanitizedName = playerName ? sanitizePlayerName(playerName) : undefined;
      sendMessage({ action: 'joinGame', gameId: gameToJoin, sessionId, playerName: sanitizedName });
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

  // Helper function to check if a player is the current user
  const isCurrentPlayer = (player: Player) => {
    return player.connectionId === connectionId || 
           (sessionId && player.sessionId === sessionId);
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

  return (
    <div className="app">
      <h1>🎮 Emoji Guesser</h1>
      <div className="connection-status">
        Status: <span className={connected ? 'connected' : 'disconnected'}>
          {connected ? '🟢 Connected' : '🔴 Disconnected'}
        </span>
        {!connected && reconnectAttemptsRef.current < maxReconnectAttempts && (
          <span className="reconnecting"> (Reconnecting...)</span>
        )}
        {!connected && reconnectAttemptsRef.current >= maxReconnectAttempts && (
          <button
            onClick={() => {
              reconnectAttemptsRef.current = 0;
              setReconnectTrigger(t => t + 1);
            }}
            className="reconnect-btn"
          >
            🔄 Reconnect
          </button>
        )}
      </div>

      {errorMessage && (
        <div className="error-notification" role="alert">
          <span>⚠️ {errorMessage}</span>
          <button onClick={() => setErrorMessage(null)} className="dismiss-error" aria-label="Dismiss error">
            ✕
          </button>
        </div>
      )}

      {!game && (
        <div className="lobby">
          <div className="game-actions">
            <div className="create-game-options">
              <label>
                <input type="radio" name="gameType" value="private" checked={!isPublic} onChange={() => setIsPublic(false)} />
                Private Game
              </label>
              <label>
                <input type="radio" name="gameType" value="public" checked={isPublic} onChange={() => setIsPublic(true)} />
                Public Game
              </label>
            </div>
            <button onClick={createGame} disabled={!connected || isLoading} className="create-game-btn">
              {isLoading ? '⏳ Creating...' : 'Create New Game'}
            </button>
            <div className="join-game-section">
              <input
                type="text"
                placeholder="Enter Game ID"
                value={gameIdInput}
                onChange={(e) => setGameIdInput(e.target.value)}
                className="game-id-input"
              />
              <button onClick={() => joinGameById()} disabled={!connected || !gameIdInput || isLoading} className="join-game-btn">
                {isLoading ? '⏳ Joining...' : 'Join Game'}
              </button>
            </div>
          </div>
          <div className="public-games-list">
            <h3>🌍 Public Games</h3>
            {publicGames.length > 0 ? (
              <div className="games-table-container">
                <table className="games-table">
                  <thead>
                    <tr>
                      <th>Game ID</th>
                      <th>Status</th>
                      <th>Players</th>
                      <th>Player Names</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {publicGames.map((publicGame) => (
                      <tr key={publicGame.gameId} className="game-row">
                        <td className="game-id-cell">
                          <code>#{publicGame.gameId}</code>
                        </td>
                        <td className="status-cell">
                          <span className={`status-badge ${publicGame.gameState === 'WAITING' ? 'waiting' : 'playing'}`}>
                            {publicGame.gameState === 'WAITING' ? '⏳ Waiting' : '🎮 Playing'}
                          </span>
                        </td>
                        <td className="player-count-cell">
                          <span className="player-count">
                            👥 {publicGame.players.length}
                          </span>
                        </td>
                        <td className="player-names-cell">
                          {publicGame.players.length > 0 ? (
                            <div className="player-names">
                              {publicGame.players.slice(0, 3).map((player, idx) => (
                                <span key={idx} className="player-tag">
                                  {player.name}
                                </span>
                              ))}
                              {publicGame.players.length > 3 && (
                                <span className="more-players">+{publicGame.players.length - 3}</span>
                              )}
                            </div>
                          ) : (
                            <span className="empty-players">No players</span>
                          )}
                        </td>
                        <td className="action-cell">
                          <button
                            onClick={() => joinGameById(publicGame.gameId)}
                            className="join-table-btn"
                            disabled={!connected || isLoading}
                          >
                            {isLoading ? '⏳' : '🚀 Join'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="no-games-message">
                <div className="no-games-icon">🎯</div>
                <p>No public games available at the moment.</p>
                <small>Create a public game to get started!</small>
              </div>
            )}
          </div>
        </div>
      )}

      {game && game.gameState === 'WAITING' && (
        <div className="game-lobby">
          <h2>🎯 Game Lobby</h2>
          <div className="game-info">
            <p><strong>Game ID:</strong> <code>{game.gameId}</code></p>
            <p><strong>Invite Link:</strong></p>
            <div className="invite-link">
              <code>{window.location.origin}{window.location.pathname}?gameId={game.gameId}</code>
              <button onClick={copyInviteLink} className={copyFeedback ? 'copy-success' : ''}>
                {copyFeedback ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>

          {isGameOwner() && (
            <div className="game-settings">
              <h3>⚙️ Game Settings</h3>
              <div className="setting-item">
                <label htmlFor="time-limit">Round Time Limit:</label>
                <select 
                  id="time-limit"
                  value={timeLimit} 
                  onChange={(e) => setTimeLimit(Number(e.target.value))}
                  className="time-limit-select"
                >
                  <option value={60}>1 minute</option>
                  <option value={120}>2 minutes</option>
                  <option value={180}>3 minutes</option>
                  <option value={240}>4 minutes</option>
                  <option value={300}>5 minutes</option>
                </select>
              </div>
              <div className="setting-item">
                <label htmlFor="max-rounds">Rounds:</label>
                <select
                  id="max-rounds"
                  value={maxRounds}
                  onChange={(e) => setMaxRounds(Number(e.target.value))}
                  className="max-rounds-select"
                >
                  <option value={2}>2 rounds</option>
                  <option value={3}>3 rounds</option>
                  <option value={4}>4 rounds</option>
                  <option value={5}>5 rounds</option>
                </select>
              </div>
            </div>
          )}
          
          <div className="players-section">
            <h3>👥 Players ({game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length})</h3>
            {game.players.filter((p: Player) => p.wantsToPlayAgain === false).length > 0 && (
              <p className="waiting-players-note">
                🔄 {game.players.filter((p: Player) => p.wantsToPlayAgain === false).length} player(s) waiting to rejoin
              </p>
            )}
            <div className="players-list">
              {game.players
                .filter((player: Player) => player.wantsToPlayAgain !== false)
                .map((player, index) => (
                <div key={index} className="player-card">
                  {isCurrentPlayer(player) ? (
                    <div className="player-name-section">
                      {editingName ? (
                        <input
                          type="text"
                          value={playerName || player.name}
                          onChange={(e) => setPlayerName(e.target.value)}
                          onBlur={(e) => {
                            const trimmedValue = e.target.value.trim();
                            if (trimmedValue.length > 0) {
                              updatePlayerName(trimmedValue);
                            } else {
                              // Reset to original name and exit editing mode
                              const currentPlayer = game.players.find(p => isCurrentPlayer(p));
                              if (currentPlayer) {
                                setPlayerName(currentPlayer.name);
                              }
                              setEditingName(false);
                            }
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const trimmedValue = e.currentTarget.value.trim();
                              if (trimmedValue && trimmedValue.length > 0) {
                                updatePlayerName(trimmedValue);
                              } else {
                                // Reset to original name and exit editing mode
                                const currentPlayer = game.players.find(p => isCurrentPlayer(p));
                                if (currentPlayer) {
                                  setPlayerName(currentPlayer.name);
                                }
                                setEditingName(false);
                              }
                            } else if (e.key === 'Escape') {
                              setEditingName(false);
                            }
                          }}
                          placeholder="Enter your name (required)"
                          className="player-name-input"
                          autoFocus
                          minLength={1}
                          maxLength={20}
                        />
                      ) : (
                        <span 
                          className="player-name-display clickable" 
                          onClick={() => setEditingName(true)}
                          title="Click to edit your name"
                        >
                          {isPlayerGameOwner(player) && <span className="host-crown" title="Game Host">👑 </span>}
                          {playerName || player.name}
                          <small className="edit-hint"> (click to edit)</small>
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="player-name">
                      {isPlayerGameOwner(player) && <span className="host-crown" title="Game Host">👑 </span>}
                      {player.name}
                    </span>
                  )}
                  <span className="player-score">Score: {player.score}</span>
                  {isCurrentPlayer(player) && <span className="you-indicator">👤 You</span>}
                </div>
              ))}
            </div>
            {game.spectators && game.spectators.length > 0 && (
              <div className="spectators-section">
                <h4>Spectators ({game.spectators.length})</h4>
                <div className="spectators-list">
                  {game.spectators.map((spectator, index) => (
                    <div key={index} className="spectator-card">
                      <span>{spectator.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {isGameOwner() && game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length > 1 && (
            <button
              onClick={startGame}
              disabled={game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length < 2 || isLoading}
              className="start-game-btn"
            >
              {isLoading
                ? '⏳ Starting...'
                : game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length < 2
                  ? 'Need at least 2 players'
                  : 'Start Game 🚀'}
            </button>
          )}
        </div>
      )}

      {game && game.gameState === 'IN_PROGRESS' && isSpectator && (
        <div className="spectator-view">
          <h2>👓 Spectator Mode</h2>
          <p>You've joined a game in progress. You can watch the current round and will join as a player in the next round.</p>
          <div className="game-content">
            <div className="main-content">
              <div className="emojis-section">
                <h3>🎭 Emoji Description</h3>
                <div className="emojis-display">
                  {emojis.length > 0 ? emojis.join(' ') : 'Waiting for emojis...'}
                </div>
              </div>
              <div className="hint-section">
                <h3>💡 Word Hint</h3>
                <div className="hint-display">
                  {currentHint}
                </div>
              </div>
              <div className="scoreboard">
                <h3>🏆 Scoreboard</h3>
                <div className="scores">
                  {game.players.map((player, index) => (
                    <div key={index} className="score-item">
                      <span className="player-name">{player.name}</span>
                      <span className="score">{player.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="chat-sidebar">
              <div className="chat-section">
                <h3>💬 Chat & Guesses</h3>
                <div className="messages" ref={messagesEndRef}>
                  {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.type}`}>
                      {msg.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {game && game.gameState === 'IN_PROGRESS' && !isSpectator && (
        <div className="game-active">
          <div className="game-content">
            <div className="main-content">
              <h2>
                🎮 Game in Progress! - Round {game.currentRound} ({game.players.length} players)
                {roundTimeLeft !== null && (
                  <span className={`timer ${roundTimeLeft <= 30 ? 'timer-warning' : ''}`}>
                    ⏰ {Math.floor(roundTimeLeft / 60)}:{(roundTimeLeft % 60).toString().padStart(2, '0')}
                  </span>
                )}
              </h2>

              {isChoosingWord && wordOptions.length > 0 && (
                <div className="word-choosing-section">
                  <h3>🎯 Choose a Word to Describe!</h3>
                  <p>Select one of the three words below:</p>
                  <div className="timer">Time left: {chooseWordTimeLeft}</div>
                  <div className="word-options">
                    {wordOptions.map((word, index) => (
                      <button 
                        key={index}
                        onClick={() => chooseWord(word)}
                        className="word-option-btn"
                      >
                        {word}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {isDescriber && (
                <div className="describer-section">
                  <h3>🎨 You are the Describer!</h3>
                  <p className="secret-word">Describe this word with emojis: <strong>{secretWord}</strong></p>
                  <div className="emoji-picker">
                    <div className="emoji-picker-header">
                      <h4>Select emojis:</h4>
                      <button onClick={() => setEmojis([])} className="clear-emojis-btn">
                        Clear Emojis
                      </button>
                    </div>
                    
                    <div className="emoji-picker-panel">
                      <EmojiPicker
                        onEmojiClick={onEmojiClick}
                        autoFocusSearch={false}
                        searchPlaceholder="Search emojis..."
                        width="100%"
                        height={400}
                        previewConfig={{
                          showPreview: false
                        }}
                        skinTonesDisabled
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="emojis-section">
                <h3>🎭 Emoji Description</h3>
                <div className="emojis-display">
                  {emojis.length > 0 ? emojis.join(' ') : 'Waiting for emojis...'}
                </div>
              </div>

              {!isDescriber && !isChoosingWord && currentHint && (
                <div className="hint-section">
                  <h3>💡 Word Hint</h3>
                  <div className="hint-display">
                    {currentHint}
                  </div>
                </div>
              )}

              <div className="scoreboard">
                <h3>🏆 Scoreboard</h3>
                <div className="scores">
                  {game.players.map((player, index) => (
                    <div key={index} className="score-item">
                      <span className="player-name">{player.name}</span>
                      <span className="score">{player.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="chat-sidebar">
              <div className="chat-section">
                <h3>💬 Chat & Guesses</h3>
                <div className="messages" ref={messagesEndRef}>
                  {messages.map((msg, i) => (
                    <div key={i} className={`message ${msg.type}`}>
                      {msg.text}
                    </div>
                  ))}
                </div>
                
                {!isDescriber && (
                  <form onSubmit={handleGuessSubmit} className="guess-form">
                    <input 
                      type="text" 
                      value={guess} 
                      onChange={(e) => setGuess(e.target.value)} 
                      placeholder="Type your guess..."
                      className="guess-input"
                    />
                    <button type="submit" disabled={!guess} className="guess-btn">
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
        <div className="game-ended">
          <h2>🎊 Game Ended!</h2>
          <div className="final-scores">
            <h3>Final Scores:</h3>
            {game.players
              .sort((a, b) => b.score - a.score)
              .map((player, index) => (
                <div key={index} className="final-score">
                  <span className="rank">#{index + 1}</span>
                  <span className="name">{player.name} {player.wantsToPlayAgain && '🔄'}</span>
                  <span className="score">{player.score}</span>
                </div>
              ))}
          </div>
          <div className="game-ended-actions">
            <button onClick={playAgain} className="play-again-btn">
              {isGameOwner() ? 'Play Again' : 'Rejoin Game'}
            </button>
            <button onClick={backToLobby} className="back-to-lobby-btn">
              Back to Lobby
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
