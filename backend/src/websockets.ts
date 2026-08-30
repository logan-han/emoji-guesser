import { APIGatewayProxyHandler, APIGatewayEvent } from 'aws-lambda';
import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { randomUUID } from 'crypto';
import { getRandomWords, generateHint } from './dictionary';
import { gameStore, publishGameEvent, GetCommand, PutCommand, UpdateCommand, DeleteCommand, ScanCommand } from './supabaseStore';

const db = gameStore;
const GAMES_TABLE = process.env.SUPABASE_GAMES_TABLE || 'games';

// Store active timeouts to prevent memory leaks
const activeTimeouts = new Map<string, NodeJS.Timeout>();

// --- Helper Functions ---

function sanitizePlayerName(name?: string): string {
    return (name || '').replace(/<[^>]*>/g, '').trim().slice(0, 20);
}

function isValidPlayerName(name?: string): boolean {
    const sanitized = sanitizePlayerName(name);
    return sanitized.length >= 1 && sanitized.length <= 20;
}

function generateRandomPlayerName(): string {
    const adjectives = ['Sunny', 'Lucky', 'Pixel', 'Cosmic', 'Jolly', 'Neon', 'Clever', 'Zesty'];
    const nouns = ['Mango', 'Panda', 'Rocket', 'Waffle', 'Noodle', 'Comet', 'Puzzle', 'Sprout'];
    const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const suffix = Math.floor(10 + Math.random() * 90);
    return `${adjective} ${noun} ${suffix}`;
}

const getApiGatewayManagementApi = (event: APIGatewayEvent) => {
    return new ApiGatewayManagementApiClient({
        endpoint: `https://${event.requestContext.domainName}/${event.requestContext.stage}`,
    });
};

const getHttpStatusCode = (error: any): number | undefined => {
    return error?.statusCode || error?.$metadata?.httpStatusCode;
};

const sendMessageToClient = async (connectionId: string, payload: any, event: APIGatewayEvent) => {
    try {
        const apiGateway = getApiGatewayManagementApi(event);
        await apiGateway.send(new PostToConnectionCommand({
            ConnectionId: connectionId,
            Data: JSON.stringify(payload),
        }));
    } catch (e: any) {
        if (getHttpStatusCode(e) !== 410) {
            console.error(`Failed to send message to ${connectionId}:`, e);
        }
    }
};

const broadcastToPlayers = async (playerIds: string[], payload: any, event: APIGatewayEvent, gameId?: string) => {
    // Send via both Realtime (for web clients) and direct WS (more reliable for mobile)
    // so a missed Realtime broadcast does not stall the lobby/waiting room.
    const eventPayload = payload.eventId ? payload : { ...payload, eventId: randomUUID() };
    const realtimeGameId = gameId || payload.game?.gameId;
    const tasks: Promise<unknown>[] = playerIds.map(id => sendMessageToClient(id, eventPayload, event));
    if (realtimeGameId) {
        tasks.push(publishGameEvent(realtimeGameId, eventPayload).catch(err => {
            console.error(`Realtime publish failed for ${realtimeGameId}:`, err);
        }));
    }
    await Promise.all(tasks);
};

const scheduleRoundTimeout = (gameId: string, timeLimit: number) => {
    // Clear any existing timeout for this game
    const existingTimeout = activeTimeouts.get(gameId);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
    }

    // Schedule a new timeout
    const timeout = setTimeout(async () => {
        console.log(`Server-side timeout triggered for game ${gameId}`);
        try {
            // Check if the game is still in DESCRIBING state
            const getParams = { TableName: GAMES_TABLE, Key: { gameId } };
            const result = await db.send(new GetCommand(getParams));
            
            if (result.Item && result.Item.turnState === 'DESCRIBING') {
                // End the round due to timeout
                await forceEndRound(gameId);
            }
        } catch (error) {
            console.error(`Error in server-side timeout for game ${gameId}:`, error);
        } finally {
            // Clean up the timeout reference
            activeTimeouts.delete(gameId);
        }
    }, timeLimit * 1000);

    activeTimeouts.set(gameId, timeout);
};

const forceEndRound = async (gameId: string) => {
    try {
        const getParams = { TableName: GAMES_TABLE, Key: { gameId } };
        const result = await db.send(new GetCommand(getParams));
        
        if (!result.Item || result.Item.turnState !== 'DESCRIBING') {
            return; // Game already ended or not in describing state
        }

        const game = result.Item;
        
        // Mark the turn as ended
        game.turnState = 'ENDING';
        
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set turnState = :t',
            ExpressionAttributeValues: { ':t': game.turnState },
        };
        await db.send(new UpdateCommand(updateParams));

        // Create a minimal event object for broadcasting
        const mockEvent = {
            requestContext: {
                domainName: process.env.API_GATEWAY_DOMAIN || 'localhost',
                stage: process.env.API_GATEWAY_STAGE || 'dev'
            }
        } as APIGatewayEvent;

        // Broadcast timeout message
        const playerIds = game.players.map((p: any) => p.connectionId);
        await broadcastToPlayers(playerIds, { 
            action: 'timeUp', 
            message: "⏰ Time's up! Moving to next turn...",
            word: game.secretWord
        }, mockEvent, gameId);

        // Move to next turn
        await nextTurn(game, mockEvent);

    } catch (error) {
        console.error(`Failed to force end round for game ${gameId}:`, error);
    }
};

async function cleanupStalePlayers(game: any, event: APIGatewayEvent): Promise<any> {
    const now = new Date().getTime();
    const staleTime = 2 * 60 * 1000; // 2 minutes
    const activePlayers = [];
    let playersChanged = false;

    for (const player of game.players) {
        const lastSeen = player.lastSeen ? new Date(player.lastSeen).getTime() : 0;
        if (now - lastSeen < staleTime) {
            activePlayers.push(player);
        } else {
            playersChanged = true;
            console.log(`Removing stale player ${player.name} (${player.connectionId}) from game ${game.gameId}`);
        }
    }

    if (playersChanged) {
        game.players = activePlayers;
        if (game.players.length === 0) {
            await db.send(new DeleteCommand({ TableName: GAMES_TABLE, Key: { gameId: game.gameId } }));
            return null; // Game deleted
        }

        // If owner is now stale, reassign
        const ownerExists = game.players.some((p: any) => p.connectionId === game.ownerId);
        if (!ownerExists) {
            game.ownerId = game.players[0].connectionId;
            game.ownerSessionId = game.players[0].sessionId;
        }

        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId: game.gameId },
            UpdateExpression: 'set players = :p, ownerId = :o, ownerSessionId = :os',
            ExpressionAttributeValues: {
                ':p': game.players,
                ':o': game.ownerId,
                ':os': game.ownerSessionId,
            },
        };
        await db.send(new UpdateCommand(updateParams));

        const playerIds = game.players.map((p: any) => p.connectionId);
        await broadcastToPlayers(playerIds, { action: 'playerLeft', game }, event);
    }

    return game;
}

// Helper function to handle player disconnect in an active game
async function handlePlayerDisconnectInActiveGame(game: any, disconnectedPlayer: any, updatedPlayers: any[], event: APIGatewayEvent) {
    const isDescriber = game.currentDescriberIndex !== undefined && 
                       game.players[game.currentDescriberIndex].connectionId === disconnectedPlayer.connectionId;
    
    console.log(`Player ${disconnectedPlayer.name} disconnected from active game ${game.gameId}. IsDescriber: ${isDescriber}, RemainingPlayers: ${updatedPlayers.length}`);
    
    // Handle case where only 2 players remain (or fewer) - end the game
    if (updatedPlayers.length <= 1) {
        console.log(`Game ${game.gameId} ending due to insufficient players (${updatedPlayers.length} remaining)`);
        
        // End the game
        game.gameState = 'ENDED';
        game.players = updatedPlayers;
        game.endedAt = new Date().toISOString();
        
        // Clear any active timeouts
        const existingTimeout = activeTimeouts.get(game.gameId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            activeTimeouts.delete(game.gameId);
        }
        
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId: game.gameId },
            UpdateExpression: 'set gameState = :s, players = :p, endedAt = :e REMOVE turnState, turnStartTime, secretWord, currentHint, wordOptions, currentDescriberIndex',
            ExpressionAttributeValues: { 
                ':s': 'ENDED', 
                ':p': updatedPlayers,
                ':e': game.endedAt
            },
        };
        
        await db.send(new UpdateCommand(updateParams));
        
        // Notify remaining players
        const playerIds = updatedPlayers.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const allIds = [...playerIds, ...spectatorIds];
        
        await broadcastToPlayers(allIds, { 
            action: 'gameEnded', 
            game: { ...game, players: updatedPlayers },
            message: `Game ended - ${disconnectedPlayer.name} left and there are not enough players to continue.`
        }, event);
        
        console.log(`Game ${game.gameId} ended due to player disconnect. Final players: ${updatedPlayers.length}`);
        return;
    }
    
    // Handle case where describer leaves and there are 3+ players remaining
    if (isDescriber && updatedPlayers.length >= 2) {
        console.log(`Describer ${disconnectedPlayer.name} left game ${game.gameId}. Ending current round and moving to next turn.`);
        
        // Update player list and reassign owner if necessary
        let ownerId = game.ownerId;
        if (game.ownerId === disconnectedPlayer.connectionId) {
            ownerId = updatedPlayers[0].connectionId;
        }
        
        // Update current describer index to account for removed player
        let newDescriberIndex = game.currentDescriberIndex;
        if (game.currentDescriberIndex >= updatedPlayers.length) {
            newDescriberIndex = 0; // Wrap around to first player
        }
        
        // Update the game with remaining players and adjust maxRounds
        game.players = updatedPlayers;
        game.ownerId = ownerId;
        game.currentDescriberIndex = newDescriberIndex;
        game.maxRounds = updatedPlayers.length; // Adjust maxRounds to match new player count
        
        // Clear any active timeouts
        const existingTimeout = activeTimeouts.get(game.gameId);
        if (existingTimeout) {
            clearTimeout(existingTimeout);
            activeTimeouts.delete(game.gameId);
        }
        
        // Move to next turn immediately
        await nextTurn(game, event);
        
        // Notify all players about the disconnect and round end
        const playerIds = updatedPlayers.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const allIds = [...playerIds, ...spectatorIds];
        
        await broadcastToPlayers(allIds, { 
            action: 'playerLeft', 
            game,
            message: `${disconnectedPlayer.name} (describer) left the game. Moving to next turn.`
        }, event);
        
        console.log(`Describer disconnect handled for game ${game.gameId}. Moved to next turn.`);
        return;
    }
    
    // Handle case where a non-describer leaves (or describer leaves with only 2 players)
    // Update player list and reassign owner if necessary
    let ownerId = game.ownerId;
    if (game.ownerId === disconnectedPlayer.connectionId) {
        ownerId = updatedPlayers[0].connectionId;
    }
    
    // Update current describer index to account for removed player
    let newDescriberIndex = game.currentDescriberIndex;
    if (game.currentDescriberIndex !== undefined) {
        // If the disconnected player was before the current describer, adjust the index
        const disconnectedPlayerIndex = game.players.findIndex((p: any) => p.connectionId === disconnectedPlayer.connectionId);
        if (disconnectedPlayerIndex < game.currentDescriberIndex) {
            newDescriberIndex = game.currentDescriberIndex - 1;
        } else if (disconnectedPlayerIndex === game.currentDescriberIndex) {
            // This case is handled above when isDescriber is true
            newDescriberIndex = game.currentDescriberIndex;
        }
        
        // Make sure the index is valid
        if (newDescriberIndex >= updatedPlayers.length) {
            newDescriberIndex = 0;
        }
    }
    
    // Update the game
    game.players = updatedPlayers;
    game.ownerId = ownerId;
    game.currentDescriberIndex = newDescriberIndex;
    game.maxRounds = updatedPlayers.length; // Adjust maxRounds to match new player count
    
    const updateParams = {
        TableName: GAMES_TABLE,
        Key: { gameId: game.gameId },
        UpdateExpression: 'set players = :p, ownerId = :o, currentDescriberIndex = :d, maxRounds = :m',
        ExpressionAttributeValues: { 
            ':p': updatedPlayers, 
            ':o': ownerId,
            ':d': newDescriberIndex,
            ':m': game.maxRounds
        }
    };
    
    await db.send(new UpdateCommand(updateParams));
    
    // Notify remaining players
    const playerIds = updatedPlayers.map((p: any) => p.connectionId);
    const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
    const allIds = [...playerIds, ...spectatorIds];
    
    await broadcastToPlayers(allIds, { 
        action: 'playerLeft', 
        game: { ...game, players: updatedPlayers, ownerId: ownerId },
        message: `${disconnectedPlayer.name} left the game.`
    }, event);
    
    console.log(`Player ${disconnectedPlayer.name} left active game ${game.gameId}. Game continues with ${updatedPlayers.length} players.`);
}

// Helper function to handle normal disconnect for non-active games
async function handleNormalDisconnect(game: any, updatedPlayers: any[], connectionId: string, event: APIGatewayEvent) {
    let ownerId = game.ownerId;
    // If the owner disconnected, assign a new owner
    if (game.ownerId === connectionId) {
        ownerId = updatedPlayers[0].connectionId;
    }

    // Update game with remaining players
    const updateParams = {
        TableName: GAMES_TABLE,
        Key: { gameId: game.gameId },
        UpdateExpression: 'set players = :p, ownerId = :o',
        ExpressionAttributeValues: { ':p': updatedPlayers, ':o': ownerId }
    };
    await db.send(new UpdateCommand(updateParams));
    
    // Notify remaining players
    const playerIds = updatedPlayers.map((p: any) => p.connectionId);
    await broadcastToPlayers(playerIds, { 
        action: 'playerLeft', 
        game: { ...game, players: updatedPlayers, ownerId: ownerId } 
    }, event);
    console.log(`Player ${connectionId} left game ${game.gameId}. New owner: ${ownerId}`);
}

// --- WebSocket Handlers ---

export const connect: APIGatewayProxyHandler = async (event) => {
  const { connectionId } = event.requestContext;
  console.log('New connection', connectionId);
  return { statusCode: 200, body: 'Connected' };
};

export const disconnect: APIGatewayProxyHandler = async (event) => {
  const { connectionId } = event.requestContext;
  console.log('Disconnected', connectionId);
  
  // Remove player from any games they were in
  try {
    const scanParams = {
      TableName: GAMES_TABLE,
    };
    
    const result = await db.send(new ScanCommand(scanParams));
    
    if (result.Items && result.Items.length > 0) {
      for (const game of result.Items) {
        const playerIndex = game.players.findIndex((p: any) => p.connectionId === connectionId);

        if (playerIndex > -1) {
          const disconnectedPlayer = game.players[playerIndex];
          const updatedPlayers = game.players.filter((p: any) => p.connectionId !== connectionId);
          
          if (updatedPlayers.length === 0) {
            // Delete empty game
            await db.send(new DeleteCommand({ TableName: GAMES_TABLE, Key: { gameId: game.gameId } }));
            console.log(`Game ${game.gameId} deleted as last player disconnected.`);
          } else {
            // Handle special cases for active games
            if (game.gameState === 'IN_PROGRESS') {
              await handlePlayerDisconnectInActiveGame(game, disconnectedPlayer, updatedPlayers, event as APIGatewayEvent);
            } else {
              // Handle normal disconnect for non-active games
              await handleNormalDisconnect(game, updatedPlayers, disconnectedPlayer.connectionId, event as APIGatewayEvent);
            }
          }
        }
      }
    }
  } catch (error) {
    console.error('Error handling disconnect:', error);
  }
  
  return { statusCode: 200, body: 'Disconnected' };
};

export const listPublicGames: APIGatewayProxyHandler = async (event) => {
    const params = {
        TableName: GAMES_TABLE,
        FilterExpression: 'isPublic = :true and gameState = :waiting',
        ExpressionAttributeValues: {
            ':true': true,
            ':waiting': 'WAITING',
        },
    };

    try {
        const result = await db.send(new ScanCommand(params));
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(result.Items),
        };
    } catch (error) {
        console.error('Failed to list public games:', error);
        return {
            statusCode: 500,
            headers: {
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ message: 'Could not list public games.' }),
        };
    }
};

// --- Game Logic Functions ---

async function sendPublicGamesList(connectionId: string, event: APIGatewayEvent) {
    const params = {
        TableName: GAMES_TABLE,
        FilterExpression: 'isPublic = :true and gameState = :waiting',
        ExpressionAttributeValues: {
            ':true': true,
            ':waiting': 'WAITING',
        },
    };

    try {
        const result = await db.send(new ScanCommand(params));
        await sendMessageToClient(connectionId, { action: 'publicGamesList', games: result.Items }, event);
    } catch (error) {
        console.error('Failed to list public games:', error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not list public games.' }, event);
    }
}
async function createGame(connectionId: string, event: APIGatewayEvent, sessionId?: string, timeLimit?: number, maxRounds?: number, isPublic?: boolean, playerName?: string) {
    const sanitizedName = sanitizePlayerName(playerName) || generateRandomPlayerName();

    const gameId = randomUUID().substring(0, 6).toUpperCase();
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24-hour TTL

    const game = {
        gameId,
        ownerId: connectionId,
        ownerSessionId: sessionId,
        players: [{
            connectionId,
            sessionId,
            score: 0,
            name: sanitizedName,
            joinedAt: now,
            lastSeen: now,
        }],
        gameState: 'WAITING',
        createdAt: now,
        updatedAt: now, // Add updatedAt timestamp
        timeLimit: timeLimit || 120,
        maxRounds: maxRounds || 2, // Default to 2 rounds if not provided
        ttl,
        isPublic: isPublic || false,
    };

    try {
        await db.send(new PutCommand({ TableName: GAMES_TABLE, Item: game }));
        console.log(`Game ${gameId} created by ${connectionId}`);
        await sendMessageToClient(connectionId, { action: 'gameCreated', game }, event);
    } catch (error) {
        console.error('Failed to create game:', error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not create game.' }, event);
    }
}

async function joinGame(connectionId: string, gameId: string, event: APIGatewayEvent, sessionId?: string, playerName?: string) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Game not found.' }, event);
            return;
        }

        const game = result.Item;
        game.spectators = game.spectators || [];

        // Check if player already in game by sessionId or connectionId
        let existingPlayer = game.players.find((p: any) => p.connectionId === connectionId);
        if (!existingPlayer && sessionId) {
            existingPlayer = game.players.find((p: any) => p.sessionId === sessionId);
        }
        
        if (existingPlayer) {
            // Update connection info for existing player
            existingPlayer.connectionId = connectionId;
            existingPlayer.lastSeen = new Date().toISOString();
            if (playerName !== undefined) {
                const sanitizedName = sanitizePlayerName(playerName);
                if (isValidPlayerName(sanitizedName)) {
                    existingPlayer.name = sanitizedName;
                }
            }
            
            // If this reconnecting player is the owner, update the ownerId
            if (sessionId && game.ownerSessionId === sessionId) {
                game.ownerId = connectionId;
            }
            
            const updateParams = {
                TableName: GAMES_TABLE,
                Key: { gameId },
                UpdateExpression: sessionId && game.ownerSessionId === sessionId 
                    ? 'set players = :p, ownerId = :o'
                    : 'set players = :p',
                ExpressionAttributeValues: sessionId && game.ownerSessionId === sessionId 
                    ? { ':p': game.players, ':o': connectionId }
                    : { ':p': game.players },
            };

            await db.send(new UpdateCommand(updateParams));
            await sendMessageToClient(connectionId, { action: 'playerJoined', game }, event);
            
            // If game is in progress, send additional info
            if (game.gameState === 'IN_PROGRESS') {
                // Determine player's role
                if (game.currentDescriberIndex !== undefined && game.players[game.currentDescriberIndex].connectionId === connectionId) {
                    if (game.turnState === 'CHOOSING_WORD' && game.wordOptions) {
                        await sendMessageToClient(connectionId, { action: 'chooseWord', wordOptions: game.wordOptions }, event);
                    } else if (game.turnState === 'DESCRIBING' && game.secretWord) {
                        await sendMessageToClient(connectionId, { action: 'describeWord', word: game.secretWord, game }, event);
                    }
                } else if (game.turnState === 'DESCRIBING' && game.currentHint) {
                    // Send current hint to non-describer players
                    await sendMessageToClient(connectionId, { action: 'hintUpdated', hint: game.currentHint }, event);
                }
            }
            
            // Notify other players
            const otherPlayerIds = game.players.map((p: any) => p.connectionId).filter((id: string) => id !== connectionId);
            await broadcastToPlayers(otherPlayerIds, { action: 'playerReconnected', game }, event);
            return;
        }

        // Handle new players
        const sanitizedName = sanitizePlayerName(playerName) || generateRandomPlayerName();

        if (game.gameState === 'IN_PROGRESS' || game.gameState === 'STARTING' || game.gameState === 'ENDED') {
            // Game in progress, add as spectator
            const newSpectator = {
                connectionId,
                sessionId,
                name: sanitizedName,
                joinedAt: new Date().toISOString(),
                lastSeen: new Date().toISOString(),
                isSpectator: true,
            };
            game.spectators.push(newSpectator);

            const updateParams = {
                TableName: GAMES_TABLE,
                Key: { gameId },
                UpdateExpression: 'set spectators = :s',
                ExpressionAttributeValues: { ':s': game.spectators },
            };
            await db.send(new UpdateCommand(updateParams));

            await sendMessageToClient(connectionId, { action: 'spectatorJoined', game }, event);
            
            const allIds = [...game.players.map((p: any) => p.connectionId), ...game.spectators.map((s: any) => s.connectionId)];
            await broadcastToPlayers(allIds, { action: 'playerJoined', game }, event);
            return;
        }

        const newPlayer = { 
            connectionId, 
            sessionId,
            score: 0, 
            name: sanitizedName,
            joinedAt: new Date().toISOString(),
            lastSeen: new Date().toISOString()
        };
        game.players.push(newPlayer);

        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set players = :p',
            ExpressionAttributeValues: { ':p': game.players },
        };

        await db.send(new UpdateCommand(updateParams));
        console.log(`Player ${connectionId} joined game ${gameId}`);

        await sendMessageToClient(connectionId, { action: 'playerJoined', game }, event);
        const otherIds = game.players
            .map((p: any) => p.connectionId)
            .filter((id: string) => id && id !== connectionId);
        await broadcastToPlayers(otherIds, { action: 'playerJoined', game }, event, gameId);

    } catch (error) {
        console.error(`Failed to join game ${gameId}:`, error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not join game.' }, event);
    }
}

async function startGame(connectionId: string, gameId: string, event: APIGatewayEvent, sessionId?: string, timeLimit?: number, maxRounds?: number) {
    try {
        // Atomically set game state to STARTING to prevent race conditions
        const startingUpdateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set gameState = :starting, updatedAt = :now',
            ConditionExpression: 'gameState = :waiting',
            ExpressionAttributeValues: {
                ':starting': 'STARTING',
                ':waiting': 'WAITING',
                ':now': new Date().toISOString(),
            },
            ReturnValues: 'ALL_NEW' as const,
        };

        const startingResult = await db.send(new UpdateCommand(startingUpdateParams));
        let game = startingResult.Attributes;

        if (!game) {
            // This could happen if the game was not in WAITING state, so the condition failed.
            // We can silently fail or notify the user.
            console.log(`Game ${gameId} could not be started, likely not in WAITING state.`);
            return;
        }

        // Now that the game is in STARTING state, other players will join as spectators.
        game = await cleanupStalePlayers(game, event);
        if (!game) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Game has been removed due to inactivity.' }, event);
            return;
        }

        // Check ownership by both connectionId and sessionId
        const isOwner = game.ownerId === connectionId || 
                       (sessionId && game.ownerSessionId === sessionId);
        
        if (!isOwner) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Only the owner can start the game.' }, event);
            return;
        }

        if (game.players.filter((p: any) => p.readyToRestart !== false).length < 2) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'You need at least 2 ready players to start.' }, event);
            return;
        }

        // Filter to only include ready players
        const readyPlayers = game.players.filter((p: any) => p.readyToRestart !== false);
        
        // Shuffle ready players for random turn order
        const shuffledPlayers = [...readyPlayers].sort(() => Math.random() - 0.5);
        
        game.gameState = 'IN_PROGRESS';
        game.currentRound = 1;
        game.maxRounds = shuffledPlayers.length; // Each player gets one turn to describe
        game.currentDescriberIndex = 0;
        game.players = shuffledPlayers;
        game.turnState = 'CHOOSING_WORD';
        game.turnStartTime = new Date().toISOString();
        
        // Generate 3 random words for the first describer to choose from
        game.wordOptions = await getRandomWords();
        
        // Update timeLimit and maxRounds if provided
        if (timeLimit !== undefined) game.timeLimit = timeLimit;
        if (maxRounds !== undefined) game.maxRounds = maxRounds;

        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set gameState = :s, currentRound = :r, currentDescriberIndex = :d, players = :p, turnState = :t, maxRounds = :m, turnStartTime = :ts, timeLimit = :tl, wordOptions = :wo, updatedAt = :now',
            ConditionExpression: 'gameState = :starting', // Ensure we are still in the starting state
            ExpressionAttributeValues: {
                ':s': game.gameState,
                ':r': game.currentRound,
                ':d': game.currentDescriberIndex,
                ':p': game.players,
                ':t': game.turnState,
                ':m': game.maxRounds,
                ':ts': game.turnStartTime,
                ':tl': game.timeLimit,
                ':wo': game.wordOptions,
                ':now': new Date().toISOString(),
                ':starting': 'STARTING',
            },
        };

        await db.send(new UpdateCommand(updateParams));
        console.log(`Game ${gameId} started`);

        const playerIds = game.players.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const allIds = [...playerIds, ...spectatorIds];
        
        await broadcastToPlayers(allIds, { action: 'gameStarted', game }, event);

        // Notify the current describer to choose a word
        const describerId = game.players[game.currentDescriberIndex].connectionId;
        await sendMessageToClient(describerId, { 
            action: 'chooseWord', 
            wordOptions: game.wordOptions 
        }, event);
        
        // Send status message to all players and spectators
        const describerName = game.players[game.currentDescriberIndex].name;
        await broadcastToPlayers(allIds, { 
            action: 'statusMessage', 
            message: `${describerName} is choosing a word...`,
            timestamp: Date.now()
        }, event, gameId);

        // Schedule a timeout for word selection
        const wordChoiceTimeout = setTimeout(async () => {
            try {
                const freshGame = await db.send(new GetCommand({ TableName: GAMES_TABLE, Key: { gameId } }));
                if (freshGame.Item && freshGame.Item.turnState === 'CHOOSING_WORD') {
                    await chooseWord(describerId, gameId, game.wordOptions[0], event);
                }
            } catch (error) {
                console.error(`Error in word choice timeout for game ${gameId}:`, error);
            }
        }, 10000); // 10 seconds

        activeTimeouts.set(`${gameId}-chooseWord`, wordChoiceTimeout);

    } catch (error) {
        console.error(`Failed to start game ${gameId}:`, error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not start game.' }, event);
    }
}

async function chooseWord(connectionId: string, gameId: string, word: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { return; }

        const game = result.Item;
        
        // Validate the sender is the current describer
        if (game.currentDescriberIndex === undefined || 
            game.players[game.currentDescriberIndex].connectionId !== connectionId) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'You are not the current describer.' }, event);
            return;
        }

        // Validate the word is one of the options
        if (!game.wordOptions || !game.wordOptions.includes(word)) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Invalid word choice.' }, event);
            return;
        }

        // Clear the word choice timeout
        const wordChoiceTimeout = activeTimeouts.get(`${gameId}-chooseWord`);
        if (wordChoiceTimeout) {
            clearTimeout(wordChoiceTimeout);
            activeTimeouts.delete(`${gameId}-chooseWord`);
        }

        game.secretWord = word.trim();
        game.turnState = 'DESCRIBING';
        game.turnStartTime = new Date().toISOString();
        
        // Generate initial hint (all blanks)
        game.currentHint = generateHint(game.secretWord, 0, game.timeLimit * 1000);

        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set secretWord = :w, turnState = :t, turnStartTime = :ts, currentHint = :h REMOVE wordOptions',
            ExpressionAttributeValues: { 
                ':w': game.secretWord, 
                ':t': game.turnState,
                ':ts': game.turnStartTime,
                ':h': game.currentHint
            },
        };

        await db.send(new UpdateCommand(updateParams));

        const describerId = game.players[game.currentDescriberIndex].connectionId;
        await sendMessageToClient(describerId, { action: 'describeWord', word: game.secretWord, game }, event);

        // Notify all other players that the turn has started with the hint
        const playerIds = game.players.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const nonDescriberIds = playerIds.filter((id: string) => id !== describerId);
        
        // Include spectators in turn start notifications
        await broadcastToPlayers([...nonDescriberIds, ...spectatorIds], { 
            action: 'turnStarted', 
            game,
            hint: game.currentHint
        }, event);

        // Schedule a server-side timeout to ensure the round ends even if no client sends timeUp
        scheduleRoundTimeout(gameId, game.timeLimit);
        
        // Also schedule additional backup timeouts at different intervals for redundancy
        // This ensures the round ends even in unreliable serverless environments
        setTimeout(async () => {
            try {
                const checkParams = { TableName: GAMES_TABLE, Key: { gameId } };
                const checkResult = await db.send(new GetCommand(checkParams));
                if (checkResult.Item && checkResult.Item.turnState === 'DESCRIBING') {
                    console.log(`Backup timeout 1 triggered for game ${gameId}`);
                    await handleTimeUp(gameId, event);
                }
            } catch (error) {
                console.error(`Backup timeout 1 error for game ${gameId}:`, error);
            }
        }, (game.timeLimit + 5) * 1000); // 5 seconds after time limit
        
        setTimeout(async () => {
            try {
                const checkParams = { TableName: GAMES_TABLE, Key: { gameId } };
                const checkResult = await db.send(new GetCommand(checkParams));
                if (checkResult.Item && checkResult.Item.turnState === 'DESCRIBING') {
                    console.log(`Backup timeout 2 triggered for game ${gameId}`);
                    await handleTimeUp(gameId, event);
                }
            } catch (error) {
                console.error(`Backup timeout 2 error for game ${gameId}:`, error);
            }
        }, (game.timeLimit + 15) * 1000); // 15 seconds after time limit

        // Start hint update timer
        await startHintTimer(gameId, event);

    } catch (error) {
        console.error(`Failed to choose word for game ${gameId}:`, error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not choose word.' }, event);
    }
}

async function startHintTimer(gameId: string, event: APIGatewayEvent) {
    // This function will be called periodically to update hints
    // For now, we'll handle hint updates in the game loop
}

async function submitGuess(connectionId: string, gameId: string, guess: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { return; }

        const game = result.Item;
        const player = game.players.find((p: any) => p.connectionId === connectionId);
        
        if (!player) return;

        // Don't allow describer to guess their own word
        if (game.currentDescriberIndex !== undefined && 
            game.players[game.currentDescriberIndex].connectionId === connectionId) {
            return;
        }

        if (guess.toLowerCase().trim() === game.secretWord.toLowerCase().trim()) {
            // Correct guess - calculate scores
            const turnDuration = Date.now() - new Date(game.turnStartTime).getTime();
            const baseScore = 100;
            const timeBonus = Math.max(0, 50 - Math.floor(turnDuration / 1000)); // Bonus for quick guesses
            
            const guesser = player;
            const describer = game.players[game.currentDescriberIndex];

            guesser.score += baseScore + timeBonus;
            describer.score += 75; // Points for successful description

            game.updatedAt = new Date().toISOString();

            const playerIds = game.players.map((p: any) => p.connectionId);
            const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
            const allIds = [...playerIds, ...spectatorIds];
            
            await broadcastToPlayers(allIds, { 
                action: 'wordGuessed', 
                guesserName: guesser.name,
                word: game.secretWord,
                game 
            }, event);

            // Move to next turn
            await nextTurn(game, event);

        } else {
            // Incorrect guess - broadcast to all players and spectators
            const playerIds = game.players.map((p: any) => p.connectionId);
            const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
            const allIds = [...playerIds, ...spectatorIds];
            
            await broadcastToPlayers(allIds, { 
                action: 'newGuess', 
                text: `${player.name}: ${guess}`,
                guesserId: connectionId
            }, event, gameId);
        }

    } catch (error) {
        console.error(`Failed to submit guess for game ${gameId}:`, error);
    }
}

async function nextTurn(game: any, event: APIGatewayEvent) {
    // Clear any active timeout for this game
    const existingTimeout = activeTimeouts.get(game.gameId);
    if (existingTimeout) {
        clearTimeout(existingTimeout);
        activeTimeouts.delete(game.gameId);
    }

    // Check if all players have had their turn
    if (game.currentRound >= game.maxRounds) {
        // Game ended
        game.gameState = 'ENDED';
        
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId: game.gameId },
            UpdateExpression: 'set gameState = :s REMOVE turnState, turnStartTime, secretWord, currentHint, wordOptions',
            ExpressionAttributeValues: { ':s': 'ENDED' },
        };
        
        await db.send(new UpdateCommand(updateParams));
        
        const playerIds = game.players.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const allIds = [...playerIds, ...spectatorIds];
        
        await broadcastToPlayers(allIds, { action: 'gameEnded', game }, event);
        return;
    }

    // Move to next turn
    game.currentDescriberIndex = (game.currentDescriberIndex + 1) % game.players.length;
    
    // If we've gone through all players once, increment round but DON'T add spectators mid-game
    // Spectators should only join at the beginning of a new game to avoid disrupting indices
    if (game.currentDescriberIndex === 0) {
        game.currentRound += 1;
        // Note: Spectators will be added to players when the game restarts, not during active gameplay
    }
    
    // Generate new word options for the next describer
    game.wordOptions = await getRandomWords();
    delete game.secretWord;
    delete game.currentHint;
    game.turnState = 'CHOOSING_WORD';
    game.turnStartTime = new Date().toISOString();

    const updateParams = {
        TableName: GAMES_TABLE,
        Key: { gameId: game.gameId },
        UpdateExpression: 'set currentDescriberIndex = :d, turnState = :t, currentRound = :r, players = :p, spectators = :sp, turnStartTime = :ts, wordOptions = :wo, maxRounds = :m REMOVE #sw, #ch',
        ExpressionAttributeValues: {
            ':d': game.currentDescriberIndex,
            ':t': game.turnState,
            ':r': game.currentRound,
            ':p': game.players,
            ':sp': game.spectators || [],
            ':ts': game.turnStartTime,
            ':wo': game.wordOptions,
            ':m': game.maxRounds
        },
        ExpressionAttributeNames: {
            '#sw': 'secretWord',
            '#ch': 'currentHint'
        }
    };

    await db.send(new UpdateCommand(updateParams));

    const playerIds = game.players.map((p: any) => p.connectionId);
    const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
    const allIds = [...playerIds, ...spectatorIds];
    
    await broadcastToPlayers(allIds, { action: 'nextTurn', game }, event);
    
    // Notify the new describer to choose a word
    const describerId = game.players[game.currentDescriberIndex].connectionId;
    await sendMessageToClient(describerId, { 
        action: 'chooseWord', 
        wordOptions: game.wordOptions 
    }, event);
    
    // Send status message to all players and spectators
    const describerName = game.players[game.currentDescriberIndex].name;
    await broadcastToPlayers(allIds, { 
        action: 'statusMessage', 
        message: `${describerName} is choosing a word...`,
        timestamp: Date.now()
    }, event, game.gameId);
}

async function submitEmoji(connectionId: string, gameId: string, emoji: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { return; } // Game not found

        const game = result.Item;
        const allIds = [...game.players.map((p: any) => p.connectionId), ...(game.spectators || []).map((s: any) => s.connectionId)];
        await broadcastToPlayers(allIds, { action: 'newEmoji', emoji }, event, gameId);

    } catch (error) {
        console.error(`Failed to submit emoji for game ${gameId}:`, error);
    }
}

async function clearEmojis(connectionId: string, gameId: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { return; }

        const game = result.Item;
        const allIds = [...game.players.map((p: any) => p.connectionId), ...(game.spectators || []).map((s: any) => s.connectionId)];
        await broadcastToPlayers(allIds, { action: 'emojisCleared' }, event, gameId);

    } catch (error) {
        console.error(`Failed to clear emojis for game ${gameId}:`, error);
    }
}

async function heartbeat(connectionId: string, event: APIGatewayEvent, sessionId?: string, gameId?: string) {
    // Update last seen timestamp for player in all games and handle hint updates
    try {
        console.log(`Heartbeat received from ${connectionId} with gameId: ${gameId}, sessionId: ${sessionId}`);
        
        // If we have a gameId, fetch that specific game directly for better performance
        let gamesToProcess: any[] = [];
        
        if (gameId) {
            try {
                const gameResult = await db.send(new GetCommand({ 
                    TableName: GAMES_TABLE, 
                    Key: { gameId } 
                }));
                
                if (gameResult.Item) {
                    gamesToProcess = [gameResult.Item];
                }
            } catch (error) {
                console.error(`Error fetching specific game ${gameId}:`, error);
            }
        }
        
        // If no specific game or game not found, scan for all games with this player
        if (gamesToProcess.length === 0) {
            const scanParams = {
                TableName: GAMES_TABLE
            };
            
            const scanResult = await db.send(new ScanCommand(scanParams));
            
            if (scanResult.Items) {
                // Filter games where this player is present
                gamesToProcess = scanResult.Items.filter(game => 
                    game.players && game.players.some((player: any) => 
                        player.connectionId === connectionId || 
                        (sessionId && player.sessionId === sessionId)
                    )
                );
            }
        }
        
        let heartbeatResponse: any = { action: 'heartbeatAck' };
        console.log(`Found ${gamesToProcess.length} games for player ${connectionId}`);
        
        for (const game of gamesToProcess) {
            let updated = false;
            for (const player of game.players) {
                if (player.connectionId === connectionId || (sessionId && player.sessionId === sessionId)) {
                    player.lastSeen = new Date().toISOString();
                    player.connectionId = connectionId; // Update connection if needed
                    updated = true;
                }
            }
            
            if (updated) {
                const updateParams = {
                    TableName: GAMES_TABLE,
                    Key: { gameId: game.gameId },
                    UpdateExpression: 'set players = :p',
                    ExpressionAttributeValues: { ':p': game.players }
                };
                await db.send(new UpdateCommand(updateParams));
            }

            // If the game is in DESCRIBING state AND this heartbeat is for this specific game, update hint
            if (gameId && game.gameId === gameId && 
                game.gameState === 'IN_PROGRESS' && game.turnState === 'DESCRIBING' && 
                game.secretWord && game.turnStartTime) {
                
                console.log(`Processing hint update for game ${game.gameId}, current hint: ${game.currentHint}`);
                
                const timeElapsed = Date.now() - new Date(game.turnStartTime).getTime();
                const elapsedSeconds = Math.floor(timeElapsed / 1000);
                
                // Check if the round should have ended due to timeout
                if (elapsedSeconds >= game.timeLimit) {
                    console.log(`Round timeout detected during heartbeat for game ${game.gameId}. Auto-ending round. Elapsed: ${elapsedSeconds}s, Limit: ${game.timeLimit}s`);
                    await handleTimeUp(game.gameId, event);
                    continue;
                }
                
                const newHint = generateHint(game.secretWord, timeElapsed, game.timeLimit * 1000);
                console.log(`Generated new hint for game ${game.gameId}: "${newHint}" (was: "${game.currentHint}")`);
                
                // Only update if hint has changed to avoid unnecessary database writes
                if (game.currentHint !== newHint) {
                    console.log(`Updating hint for game ${game.gameId} from "${game.currentHint}" to "${newHint}"`);
                    game.currentHint = newHint;
                    
                    const hintUpdateParams = {
                        TableName: GAMES_TABLE,
                        Key: { gameId: game.gameId },
                        UpdateExpression: 'set currentHint = :h',
                        ExpressionAttributeValues: { ':h': game.currentHint },
                    };
                    await db.send(new UpdateCommand(hintUpdateParams));

                    // Broadcast updated hint to all non-describer players and spectators
                    const playerIds = game.players.map((p: any) => p.connectionId);
                    const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
                    const describerId = game.players[game.currentDescriberIndex].connectionId;
                    const nonDescriberIds = playerIds.filter((id: string) => id !== describerId);
                    const allNonDescriberIds = [...nonDescriberIds, ...spectatorIds];
                    
                    console.log(`Broadcasting hint update to ${allNonDescriberIds.length} players/spectators`);
                    await broadcastToPlayers(allNonDescriberIds, { 
                        action: 'hintUpdated', 
                        hint: game.currentHint
                    }, event, game.gameId);
                }

                // Include current hint in heartbeat response if this player is not the describer
                const isDescriber = game.currentDescriberIndex !== undefined && 
                                  game.players[game.currentDescriberIndex].connectionId === connectionId;
                if (!isDescriber) {
                    heartbeatResponse.currentHint = game.currentHint;
                    console.log(`Including hint in heartbeat response for non-describer: ${game.currentHint}`);
                }
            }
        }
        
        console.log(`Sending heartbeat response:`, heartbeatResponse);
        await sendMessageToClient(connectionId, heartbeatResponse, event);
    } catch (error) {
        console.error('Failed to process heartbeat:', error);
    }
}

async function updatePlayerName(connectionId: string, gameId: string, name: string, event: APIGatewayEvent, sessionId?: string) {
    const sanitizedName = sanitizePlayerName(name);
    if (!isValidPlayerName(sanitizedName)) {
        await sendMessageToClient(connectionId, { action: 'error', message: 'Player name is required.' }, event);
        return;
    }

    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Game not found.' }, event);
            return;
        }

        const game = result.Item;
        let playerIndex = game.players.findIndex((p: any) => p.connectionId === connectionId);
        
        // If not found by connectionId, try sessionId
        if (playerIndex === -1 && sessionId) {
            playerIndex = game.players.findIndex((p: any) => p.sessionId === sessionId);
        }
        
        if (playerIndex === -1) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Player not found in game.' }, event);
            return;
        }

        game.players[playerIndex].name = sanitizedName;
        game.players[playerIndex].lastSeen = new Date().toISOString();

        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set players = :p',
            ExpressionAttributeValues: { ':p': game.players },
        };

        await db.send(new UpdateCommand(updateParams));
        
        const playerIds = game.players.map((p: any) => p.connectionId);
        await broadcastToPlayers(playerIds, { action: 'playerNameUpdated', game }, event);

    } catch (error) {
        console.error(`Failed to update player name for game ${gameId}:`, error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not update name.' }, event);
    }
}

async function handleTimeUp(gameId: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { 
            console.log(`Game ${gameId} not found during timeUp`);
            return; 
        }

        const game = result.Item;
        
        // Check if game is still in describing state
        if (game.turnState !== 'DESCRIBING') {
            console.log(`Game ${gameId} not in DESCRIBING state during timeUp (current: ${game.turnState})`);
            return; // Round already ended
        }

        // Check if the time is actually up - be more lenient to ensure rounds end
        const turnStartTime = new Date(game.turnStartTime).getTime();
        const currentTime = Date.now();
        const elapsedSeconds = Math.floor((currentTime - turnStartTime) / 1000);
        
        // Only reject timeUp if it's very early (more than 10 seconds before time limit)
        // This allows for network delays and client-side timer variations
        if (elapsedSeconds < (game.timeLimit - 10)) {
            console.log(`Ignoring very premature timeUp for game ${gameId}. Elapsed: ${elapsedSeconds}s, Limit: ${game.timeLimit}s`);
            return;
        }

        console.log(`Processing timeUp for game ${gameId}. Elapsed: ${elapsedSeconds}s, Limit: ${game.timeLimit}s`);

        // Mark the turn as ended to prevent duplicate processing
        game.turnState = 'ENDING';
        
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set turnState = :t',
            ExpressionAttributeValues: { ':t': game.turnState },
        };
        await db.send(new UpdateCommand(updateParams));
        console.log(`Game ${gameId} marked as ENDING`);

        // End the current round due to timeout
        const playerIds = game.players.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const allIds = [...playerIds, ...spectatorIds];
        
        await broadcastToPlayers(allIds, { 
            action: 'timeUp', 
            message: "⏰ Time's up! Moving to next turn...",
            word: game.secretWord
        }, event, gameId);

        // Move to next turn
        console.log(`Moving to next turn for game ${gameId}`);
        await nextTurn(game, event);

    } catch (error) {
        console.error(`Failed to handle time up for game ${gameId}:`, error);
    }
}

async function updateHint(gameId: string, event: APIGatewayEvent) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) { return; }

        const game = result.Item;
        
        // Only update hint if game is in describing state
        if (game.turnState !== 'DESCRIBING' || !game.secretWord || !game.turnStartTime) {
            return;
        }

        const timeElapsed = Date.now() - new Date(game.turnStartTime).getTime();
        const elapsedSeconds = Math.floor(timeElapsed / 1000);
        
        // Check if the round should have ended due to timeout - be more aggressive in the final moments
        if (elapsedSeconds >= game.timeLimit) {
            console.log(`Round timeout detected during hint update for game ${gameId}. Auto-ending round. Elapsed: ${elapsedSeconds}s, Limit: ${game.timeLimit}s`);
            await handleTimeUp(gameId, event);
            return;
        }
        
        // Also check if we're very close to timeout (within 2 seconds) and force end
        if (elapsedSeconds >= (game.timeLimit - 2)) {
            console.log(`Round very close to timeout during hint update for game ${gameId}. Force-ending round. Elapsed: ${elapsedSeconds}s, Limit: ${game.timeLimit}s`);
            await handleTimeUp(gameId, event);
            return;
        }

        const newHint = generateHint(game.secretWord, timeElapsed, game.timeLimit * 1000);
        
        // Update hint in database regardless of whether it changed (to maintain consistency)
        game.currentHint = newHint;
        
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set currentHint = :h',
            ExpressionAttributeValues: { ':h': game.currentHint },
        };

        await db.send(new UpdateCommand(updateParams));

        // Broadcast updated hint to all non-describer players and spectators
        const playerIds = game.players.map((p: any) => p.connectionId);
        const spectatorIds = game.spectators ? game.spectators.map((s: any) => s.connectionId) : [];
        const describerId = game.players[game.currentDescriberIndex].connectionId;
        const nonDescriberIds = playerIds.filter((id: string) => id !== describerId);
        
        // Include spectators in hint updates
        const allNonDescriberIds = [...nonDescriberIds, ...spectatorIds];
        
        await broadcastToPlayers(allNonDescriberIds, { 
            action: 'hintUpdated', 
            hint: game.currentHint
        }, event, gameId);

    } catch (error) {
        console.error(`Failed to update hint for game ${gameId}:`, error);
    }
}

async function restartGame(connectionId: string, gameId: string, event: APIGatewayEvent, sessionId?: string, timeLimit?: number) {
    const getParams = { TableName: GAMES_TABLE, Key: { gameId } };

    try {
        const result = await db.send(new GetCommand(getParams));
        if (!result.Item) {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Game not found.' }, event);
            return;
        }

        const game = result.Item;

        // Check ownership by both connectionId and sessionId
        const isOwner = game.ownerId === connectionId || 
                       (sessionId && game.ownerSessionId === sessionId);
        
        if (!isOwner) {
            // If not owner, allow player to rejoin if game is ended
            if (game.gameState === 'ENDED') {
                // Find if this player was in the game before
                const existingPlayerIndex = game.players.findIndex((p: any) => 
                    p.connectionId === connectionId || 
                    (sessionId && p.sessionId === sessionId)
                );
                
                if (existingPlayerIndex !== -1) {
                    // Player rejoining - update their connection info and mark as ready
                    const existingPlayer = game.players[existingPlayerIndex];
                    existingPlayer.connectionId = connectionId;
                    existingPlayer.lastSeen = new Date().toISOString();
                    existingPlayer.wantsToPlayAgain = true;
                    
                    // Check if this is the first player to rejoin and there's no active owner
                    const activeOwner = game.players.find((p: any) => 
                        (p.connectionId === game.ownerId || 
                         (p.sessionId && p.sessionId === game.ownerSessionId)) &&
                        p.wantsToPlayAgain !== false
                    );
                    
                    if (!activeOwner) {
                        // Make this player the new owner
                        game.ownerId = connectionId;
                        game.ownerSessionId = sessionId;
                        existingPlayer.isOwner = true;
                        console.log(`Making ${connectionId} the new owner of game ${gameId}`);
                    }
                    
                    const updateParams = {
                        TableName: GAMES_TABLE,
                        Key: { gameId },
                        UpdateExpression: 'set players = :p, ownerId = :o, ownerSessionId = :os',
                        ExpressionAttributeValues: {
                            ':p': game.players,
                            ':o': game.ownerId,
                            ':os': game.ownerSessionId
                        },
                    };

                    await db.send(new UpdateCommand(updateParams));
                    
                    // Send rejoin confirmation to this player
                    await sendMessageToClient(connectionId, { 
                        action: 'gameRestarted', 
                        game,
                        isNewOwner: game.ownerId === connectionId,
                        message: game.ownerId === connectionId ? 'You are now the game owner!' : 'You have rejoined the game!'
                    }, event);
                    
                    // Notify other ready players that someone rejoined
                    const otherPlayerIds = game.players
                        .filter((p: any) => p.connectionId !== connectionId && p.wantsToPlayAgain !== false)
                        .map((p: any) => p.connectionId);
                    
                    if (otherPlayerIds.length > 0) {
                        await broadcastToPlayers(otherPlayerIds, { 
                            action: 'playerRejoined', 
                            game,
                            rejoinedPlayer: existingPlayer.name
                        }, event);
                    }
                    
                    return;
                } else {
                    await sendMessageToClient(connectionId, { action: 'error', message: 'You were not in this game.' }, event);
                    return;
                }
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'Only the owner can restart the game.' }, event);
                return;
            }
        }

        // Owner restarting the game
        if (game.gameState !== 'ENDED') {
            await sendMessageToClient(connectionId, { action: 'error', message: 'Can only restart ended games.' }, event);
            return;
        }

        // Reset game state but keep the same players
        game.gameState = 'WAITING';
        game.currentRound = undefined;
        game.maxRounds = undefined;
        game.currentDescriberIndex = undefined;
        game.turnState = undefined;
        game.turnStartTime = undefined;
        game.endedAt = undefined;
        game.ttl = Math.floor(Date.now() / 1000) + 86400; // 24 hours from now
        
        // Add spectators to players array for the new game
        if (game.spectators && game.spectators.length > 0) {
            // Convert spectators to players
            const newPlayers = game.spectators.map((spectator: any) => ({
                ...spectator,
                score: 0,
                isSpectator: undefined // Remove spectator flag
            }));
            game.players.push(...newPlayers);
            game.spectators = [];
        }
        
        // Reset player scores and mark all players as ready (they can opt out later)
        game.players.forEach((player: any) => {
            player.score = 0;
            player.lastSeen = new Date().toISOString();
            player.wantsToPlayAgain = true; // Mark all as ready initially
            player.isOwner = player.connectionId === connectionId || 
                           (sessionId && player.sessionId === sessionId);
        });

        // Update timeLimit if provided
        if (timeLimit !== undefined) {
            game.timeLimit = timeLimit;
        }

        // Clean up game state
        const updateParams = {
            TableName: GAMES_TABLE,
            Key: { gameId },
            UpdateExpression: 'set gameState = :s, players = :p, spectators = :sp, timeLimit = :tl REMOVE currentRound, maxRounds, currentDescriberIndex, turnState, turnStartTime, endedAt, secretWord, wordOptions, currentHint',
            ExpressionAttributeValues: {
                ':s': game.gameState,
                ':p': game.players,
                ':sp': game.spectators || [],
                ':tl': game.timeLimit
            },
        };

        await db.send(new UpdateCommand(updateParams));
        console.log(`Game ${gameId} restarted by owner`);

        // Notify all players that the game has been restarted
        const playerIds = game.players.map((p: any) => p.connectionId);
        await broadcastToPlayers(playerIds, { action: 'gameRestarted', game }, event);

    } catch (error) {
        console.error(`Failed to restart game ${gameId}:`, error);
        await sendMessageToClient(connectionId, { action: 'error', message: 'Could not restart game.' }, event);
    }
}

// --- Default Message Handler ---

export const default_handler: APIGatewayProxyHandler = async (event) => {
    const { connectionId } = event.requestContext;

    if (!event.body || !connectionId) {
        return { statusCode: 400, body: 'Invalid request' };
    }

    let data;
    try {
        data = JSON.parse(event.body);
    } catch (e) {
        console.error("Failed to parse message body:", event.body);
        return { statusCode: 400, body: 'Invalid JSON format.' };
    }

    const { action, gameId, word, guess, emoji, name, sessionId, playerName, timeLimit, maxRounds, isPublic } = data;
    console.log(`Action '${action}' received from ${connectionId}`);

    const apiGatewayEvent = event as APIGatewayEvent;

    switch (action) {
        case 'listPublicGames':
            await sendPublicGamesList(connectionId, apiGatewayEvent);
            break;
        case 'createGame':
            await createGame(connectionId, apiGatewayEvent, sessionId, timeLimit, maxRounds, isPublic, playerName);
            break;
        case 'joinGame':
            if (gameId) {
                await joinGame(connectionId, gameId, apiGatewayEvent, sessionId, playerName);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for joinGame action.' }, apiGatewayEvent);
            }
            break;
        case 'startGame':
            if (gameId) {
                await startGame(connectionId, gameId, apiGatewayEvent, sessionId, timeLimit, maxRounds);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for startGame action.' }, apiGatewayEvent);
            }
            break;
        case 'updatePlayerName':
            if (gameId && name) {
                await updatePlayerName(connectionId, gameId, name, apiGatewayEvent, sessionId);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId and name are required for updatePlayerName action.' }, apiGatewayEvent);
            }
            break;
        case 'heartbeat':
            await heartbeat(connectionId, apiGatewayEvent, sessionId, gameId);
            break;
        case 'chooseWord':
            if (gameId && word) {
                await chooseWord(connectionId, gameId, word, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId and word are required for chooseWord action.' }, apiGatewayEvent);
            }
            break;
        case 'updateHint':
            if (gameId) {
                await updateHint(gameId, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for updateHint action.' }, apiGatewayEvent);
            }
            break;
        case 'submitGuess':
            if (gameId && guess) {
                await submitGuess(connectionId, gameId, guess, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId and guess are required for submitGuess action.' }, apiGatewayEvent);
            }
            break;
        case 'submitEmoji':
            if (gameId && emoji) {
                await submitEmoji(connectionId, gameId, emoji, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId and emoji are required for submitEmoji action.' }, apiGatewayEvent);
            }
            break;
        case 'clearEmojis':
            if (gameId) {
                await clearEmojis(connectionId, gameId, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for clearEmojis action.' }, apiGatewayEvent);
            }
            break;
        case 'timeUp':
            if (gameId) {
                await handleTimeUp(gameId, apiGatewayEvent);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for timeUp action.' }, apiGatewayEvent);
            }
            break;
        case 'restartGame':
            if (gameId) {
                await restartGame(connectionId, gameId, apiGatewayEvent, sessionId, timeLimit);
            } else {
                await sendMessageToClient(connectionId, { action: 'error', message: 'gameId is required for restartGame action.' }, apiGatewayEvent);
            }
            break;
        default:
            await sendMessageToClient(connectionId, { action: 'error', message: `Unknown action: ${action}` }, apiGatewayEvent);
            break;
    }

    return { statusCode: 200, body: 'Message handled.' };
};

export const cleanupGames: APIGatewayProxyHandler = async (event) => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const scanParams = {
        TableName: GAMES_TABLE,
    };

    try {
        const result = await db.send(new ScanCommand(scanParams));
        if (!result.Items) {
            return { statusCode: 200, body: 'No games to process.' };
        }

        for (const game of result.Items) {
            const hasActivePlayers = game.players.some((p: any) => new Date(p.lastSeen).toISOString() > fiveMinutesAgo);

            if (game.players.length === 0) {
                await db.send(new DeleteCommand({ TableName: GAMES_TABLE, Key: { gameId: game.gameId } }));
                console.log(`Deleted game ${game.gameId} due to no players.`);
            } else if ((game.gameState === 'WAITING' || game.gameState === 'ENDED') && game.updatedAt < twoHoursAgo) {
                await db.send(new DeleteCommand({ TableName: GAMES_TABLE, Key: { gameId: game.gameId } }));
                console.log(`Deleted stale game ${game.gameId} in ${game.gameState} state.`);
            } else if (game.gameState === 'IN_PROGRESS' && !hasActivePlayers) {
                await db.send(new DeleteCommand({ TableName: GAMES_TABLE, Key: { gameId: game.gameId } }));
                console.log(`Deleted inactive game ${game.gameId} in IN_PROGRESS state.`);
            }
        }

        return { statusCode: 200, body: 'Cleanup complete.' };
    } catch (error) {
        console.error('Error during game cleanup:', error);
        return { statusCode: 500, body: 'Error during cleanup.' };
    }
};
