import { neon } from '@neondatabase/serverless';
import { handle } from '../server/http.js';
import { sqlStore } from '../server/sqlStore.js';

declare const process: { env: Record<string, string | undefined> };

/** Both routes share one store: the project's Neon database. */
const sql = neon(process.env.DATABASE_URL ?? '');
const store = sqlStore((text, params) => sql.query(text, params));

export default { fetch: (req: Request) => handle(req, { store }) };
