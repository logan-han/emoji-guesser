import { createClient, SupabaseClient } from '@supabase/supabase-js';

type CommandInput = Record<string, any>;

export class GetCommand {
    constructor(public input: CommandInput) {}
}

export class PutCommand {
    constructor(public input: CommandInput) {}
}

export class UpdateCommand {
    constructor(public input: CommandInput) {}
}

export class DeleteCommand {
    constructor(public input: CommandInput) {}
}

export class ScanCommand {
    constructor(public input: CommandInput) {}
}

const TABLE = process.env.SUPABASE_GAMES_TABLE || 'games';

let supabaseClient: SupabaseClient | null = null;

function getSupabase(): SupabaseClient {
    if (supabaseClient) {
        return supabaseClient;
    }

    const url = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !serviceRoleKey) {
        throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be configured.');
    }

    supabaseClient = createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
        },
    });

    return supabaseClient;
}

function toRow(game: any) {
    const updatedAt = game.updatedAt || new Date().toISOString();
    const data = { ...game, updatedAt };

    return {
        game_id: game.gameId,
        data,
        is_public: Boolean(game.isPublic),
        game_state: game.gameState,
        updated_at: updatedAt,
        ttl: game.ttl || null,
    };
}

function fromRow(row: any) {
    return row?.data;
}

function resolveAttribute(name: string, expressionAttributeNames?: Record<string, string>) {
    return expressionAttributeNames?.[name] || name;
}

function applyUpdateExpression(game: any, input: CommandInput) {
    const nextGame = { ...game };
    const expression = input.UpdateExpression || '';
    const values = input.ExpressionAttributeValues || {};
    const names = input.ExpressionAttributeNames || {};

    const setMatch = expression.match(/set\s+(.+?)(?:\s+REMOVE\s+|$)/i);
    if (setMatch) {
        for (const assignment of setMatch[1].split(',')) {
            const [rawKey, rawValue] = assignment.split('=').map((part: string) => part.trim());
            if (!rawKey || !rawValue) {
                continue;
            }
            nextGame[resolveAttribute(rawKey, names)] = values[rawValue];
        }
    }

    const removeMatch = expression.match(/\sREMOVE\s+(.+)$/i);
    if (removeMatch) {
        for (const rawKey of removeMatch[1].split(',')) {
            const key = resolveAttribute(rawKey.trim(), names);
            delete nextGame[key];
        }
    }

    nextGame.updatedAt = new Date().toISOString();
    return nextGame;
}

function conditionMatches(game: any, input: CommandInput) {
    const condition = input.ConditionExpression;
    if (!condition) {
        return true;
    }

    const equality = condition.match(/^([A-Za-z0-9_#]+)\s*=\s*(:[A-Za-z0-9_]+)$/);
    if (!equality) {
        throw new Error(`Unsupported condition expression: ${condition}`);
    }

    const attribute = resolveAttribute(equality[1], input.ExpressionAttributeNames);
    const expected = input.ExpressionAttributeValues?.[equality[2]];
    return game?.[attribute] === expected;
}

async function getGame(gameId: string) {
    const { data, error } = await getSupabase()
        .from(TABLE)
        .select('data')
        .eq('game_id', gameId)
        .maybeSingle();

    if (error) {
        throw error;
    }

    return fromRow(data);
}

async function listGames(input: CommandInput) {
    let query = getSupabase().from(TABLE).select('data');

    if (input.FilterExpression === 'isPublic = :true and gameState = :waiting') {
        query = query
            .eq('is_public', input.ExpressionAttributeValues?.[':true'])
            .eq('game_state', input.ExpressionAttributeValues?.[':waiting']);
    }

    const { data, error } = await query;
    if (error) {
        throw error;
    }

    return (data || []).map(fromRow).filter(Boolean);
}

export const gameStore = {
    async send(command: GetCommand | PutCommand | UpdateCommand | DeleteCommand | ScanCommand) {
        if (command instanceof GetCommand) {
            const item = await getGame(command.input.Key.gameId);
            return item ? { Item: item } : {};
        }

        if (command instanceof PutCommand) {
            const { error } = await getSupabase()
                .from(TABLE)
                .upsert(toRow(command.input.Item), { onConflict: 'game_id' });

            if (error) {
                throw error;
            }

            return {};
        }

        if (command instanceof UpdateCommand) {
            const gameId = command.input.Key.gameId;
            const existingGame = await getGame(gameId);

            if (!existingGame || !conditionMatches(existingGame, command.input)) {
                return {};
            }

            const updatedGame = applyUpdateExpression(existingGame, command.input);
            const { error } = await getSupabase()
                .from(TABLE)
                .upsert(toRow(updatedGame), { onConflict: 'game_id' });

            if (error) {
                throw error;
            }

            return command.input.ReturnValues === 'ALL_NEW' ? { Attributes: updatedGame } : {};
        }

        if (command instanceof DeleteCommand) {
            const { error } = await getSupabase()
                .from(TABLE)
                .delete()
                .eq('game_id', command.input.Key.gameId);

            if (error) {
                throw error;
            }

            return {};
        }

        if (command instanceof ScanCommand) {
            const items = await listGames(command.input);
            return { Items: items };
        }

        throw new Error('Unsupported Supabase store command.');
    },
};

export async function publishGameEvent(gameId: string, payload: any) {
    const channel = getSupabase().channel(`game:${gameId}`);

    await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out subscribing to game:${gameId}`)), 5000);

        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                clearTimeout(timeout);
                resolve();
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(timeout);
                reject(new Error(`Realtime channel game:${gameId} failed with status ${status}`));
            }
        });
    });

    try {
        const response = await channel.send({
            type: 'broadcast',
            event: 'game_event',
            payload,
        });

        if (response !== 'ok') {
            throw new Error(`Realtime broadcast failed with status ${response}`);
        }
    } finally {
        await getSupabase().removeChannel(channel);
    }
}
