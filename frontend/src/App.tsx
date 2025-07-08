import React, { useState, useEffect, FormEvent, useRef, useCallback } from 'react';
import './App.css';
import EmojiPicker, { EmojiClickData } from 'emoji-picker-react';
import { playSound } from './sounds';

interface Player {
  connectionId: string;
  sessionId?: string;
  name: string;
  score: number;
  wantsToPlayAgain?: boolean;
}

interface Game {
  gameId: string;
  ownerId: string;
  ownerSessionId?: string;
  players: Player[];
  gameState: 'WAITING' | 'IN_PROGRESS' | 'ENDED';
  currentRound?: number;
  currentDescriberIndex?: number;
  secretWord?: string;
  wordOptions?: string[];
  turnState?: 'CHOOSING_WORD' | 'DESCRIBING';
  timeLimit?: number;
  turnStartTime?: string;
  currentHint?: string;
}

interface Message {
  text: string;
  type: 'guess' | 'system' | 'emoji';
  timestamp: number;
}

const App: React.FC = () => {
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [game, setGame] = useState<Game | null>(null);
  const [playerName, setPlayerName] = useState('');
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
  const [timeLimit, setTimeLimit] = useState<number>(180); // 3 minutes in seconds
  const [roundTimeLeft, setRoundTimeLeft] = useState<number | null>(null);
  const [timerInterval, setTimerInterval] = useState<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load saved player data on mount
  useEffect(() => {
    const savedSessionId = localStorage.getItem('emoji-guesser-session');
    const savedPlayerName = localStorage.getItem('emoji-guesser-player-name');
    
    if (savedSessionId) {
      setSessionId(savedSessionId);
    } else {
      const newSessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setSessionId(newSessionId);
      localStorage.setItem('emoji-guesser-session', newSessionId);
    }
    
    if (savedPlayerName) {
      setPlayerName(savedPlayerName);
    }
    fetchPublicGames();
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
      console.log('Connected to WebSocket');

      // Start heartbeat
      const interval = setInterval(() => {
        if (newWs.readyState === WebSocket.OPEN) {
          newWs.send(JSON.stringify({ action: 'heartbeat', sessionId }));
        }
      }, 30000); // Every 30 seconds
      heartbeatIntervalRef.current = interval;

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
      // Clear heartbeat on disconnect
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    };

    newWs.onerror = (error) => {
      console.error('WebSocket error:', error);
      setConnected(false);
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
      clearRoundTimer(); // Clean up timer on unmount
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Only depend on sessionId, playerName is captured in closure

  // Auto-scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTop = messagesEndRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchPublicGames = async () => {
    try {
      const response = await fetch(process.env.REACT_APP_API_URL + '/games');
      const data = await response.json();
      setPublicGames(data);
    } catch (error) {
      console.error('Failed to fetch public games:', error);
    }
  };

  const sendMessage = useCallback((message: any) => {
    if (ws && connected) {
      ws.send(JSON.stringify(message));
    }
  }, [ws, connected]);

  const startRoundTimer = useCallback((gameState: Game) => {
    // Clear any existing timer
    if (timerInterval) {
      clearInterval(timerInterval);
      setTimerInterval(null);
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
              setTimerInterval(null);
              setRoundTimeLeft(0);
              
              // Time's up! All players should notify server for redundancy, but server will handle deduplication
              if (gameState.gameId) {
                // Send multiple timeUp messages immediately and with delays to ensure delivery
                sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                
                // Send timeUp multiple times with delay to ensure the server gets it
                setTimeout(() => {
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                }, 500);
                setTimeout(() => {
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                }, 1500);
                setTimeout(() => {
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                  sendMessage({ action: 'timeUp', gameId: gameState.gameId });
                }, 3000);
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
        if (gameState.gameId) {
          sendMessage({ action: 'timeUp', gameId: gameState.gameId });
        }
      }
    }
  }, [sendMessage, timerInterval]);

  useEffect(() => {
    if (game && game.turnState === 'DESCRIBING' && game.gameId) {
      // Update hint more frequently to ensure smooth progression
      // The backend will calculate the appropriate hint based on time elapsed
      const hintInterval = setInterval(() => {
        sendMessage({ action: 'updateHint', gameId: game.gameId });
      }, 2000); // Update hint every 2 seconds for smoother updates
      
      // In the last 30 seconds, update even more frequently to catch timeouts
      let aggressiveInterval: NodeJS.Timeout | null = null;
      const timeLeft = roundTimeLeft;
      if (timeLeft !== null && timeLeft <= 30) {
        aggressiveInterval = setInterval(() => {
          sendMessage({ action: 'updateHint', gameId: game.gameId });
        }, 500); // Every 500ms in the final 30 seconds
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
    setRoundTimeLeft(null);
  }, [timerInterval]);

  const onEmojiClick = (emojiData: EmojiClickData) => {
    if (game) {
      sendMessage({ action: 'submitEmoji', gameId: game.gameId, emoji: emojiData.emoji });
    }
  };

  const handleMessage = (data: any) => {
    switch (data.action) {
      case 'connected':
        setConnectionId(data.connectionId);
        break;
      case 'gameCreated':
        setGame(data.game);
        setConnectionId(data.game.ownerId);
        console.log('Game created:', data.game);
        window.history.pushState({}, '', `?gameId=${data.game.gameId}`);
        break;
      case 'playerJoined':
        playSound('playerJoined');
        setGame(data.game);
        if (data.game.gameState === 'IN_PROGRESS') {
          startRoundTimer(data.game);
        }
        break;
      case 'playerNameUpdated':
      case 'playerReconnected':
        setGame(data.game);
        if (data.action === 'playerReconnected') {
          // Don't show message for own reconnection
        }
        console.log('Player joined/updated/reconnected:', data.game);
        break;
      case 'gameStarted':
        playSound('gameStart');
        setGame(data.game);
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
          text: `🎉 ${data.guesserName} guessed correctly!`, 
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
        setMessages(prev => [...prev, { 
          text: 'A player left the game', 
          type: 'system', 
          timestamp: Date.now() 
        }]);
        break;
      case 'error':
        alert(`Error: ${data.message}`);
        break;
      case 'heartbeatAck':
        // Heartbeat acknowledged, connection is alive
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
    sendMessage({ action: 'createGame', sessionId, timeLimit, isPublic });
  };

  const startGame = () => {
    playSound('buttonClick');
    if (game) sendMessage({ action: 'startGame', gameId: game.gameId, sessionId, timeLimit });
  };

  const joinGameById = (id?: string) => {
    playSound('buttonClick');
    const gameToJoin = id || gameIdInput;
    if (gameToJoin) {
      sendMessage({ action: 'joinGame', gameId: gameToJoin, sessionId, playerName: playerName || undefined });
      setGameIdInput('');
    }
  };

  const updatePlayerName = (newName: string) => {
    // Ensure name is not empty and at least 1 character
    const trimmedName = newName.trim();
    if (!trimmedName || trimmedName.length === 0) {
      setEditingName(false);
      return;
    }
    
    setPlayerName(trimmedName);
    localStorage.setItem('emoji-guesser-player-name', trimmedName);
    if (game) {
      sendMessage({ action: 'updatePlayerName', gameId: game.gameId, name: trimmedName, sessionId });
    }
    setEditingName(false);
  };

  // Helper function to check if a player is the current user
  const isCurrentPlayer = (player: any) => {
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
    if (game && guess) {
      sendMessage({ action: 'submitGuess', gameId: game.gameId, guess });
      setGuess('');
    }
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
      sendMessage({ action: 'restartGame', gameId: game.gameId, sessionId, timeLimit });
    }
  };

  const backToLobby = () => {
    setGame(null);
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
      </div>

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
            <button onClick={createGame} disabled={!connected} className="create-game-btn">
              Create New Game
            </button>
            <div className="join-game-section">
              <input
                type="text"
                placeholder="Enter Game ID"
                value={gameIdInput}
                onChange={(e) => setGameIdInput(e.target.value)}
                className="game-id-input"
              />
              <button onClick={joinGameById} disabled={!connected || !gameIdInput} className="join-game-btn">
                Join Game
              </button>
            </div>
          </div>
          <div className="public-games-list">
            <h3>Public Games</h3>
            {publicGames.length > 0 ? (
              <ul>
                {publicGames.map((game) => (
                  <li key={game.gameId}>
                    <span>{game.gameId} - {game.players.length} players</span>
                    <button onClick={() => joinGameById(game.gameId)}>Join</button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No public games available.</p>
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
                            if (trimmedValue && trimmedValue.length > 0) {
                              updatePlayerName(trimmedValue);
                            } else {
                              setEditingName(false);
                            }
                          }}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') {
                              const trimmedValue = e.currentTarget.value.trim();
                              if (trimmedValue && trimmedValue.length > 0) {
                                updatePlayerName(trimmedValue);
                              } else {
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
          </div>
          
          {isGameOwner() && game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length > 1 && (
            <button 
              onClick={startGame} 
              disabled={game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length < 2}
              className="start-game-btn"
            >
              {game.players.filter((p: Player) => p.wantsToPlayAgain !== false).length < 2 
                ? 'Need at least 2 players' 
                : 'Start Game 🚀'}
            </button>
          )}
        </div>
      )}

      {game && game.gameState === 'IN_PROGRESS' && (
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
