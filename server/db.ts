import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

// If DATABASE_URL points to Supabase (http/https), build the local Replit PG URL instead
function getConnectionString(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("http")) {
    const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
    if (PGHOST && PGDATABASE) {
      return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`;
    }
    return undefined;
  }
  return url;
}

const connectionString = getConnectionString();

export const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    })
  : null as any;

export const db = connectionString
  ? drizzle(pool, { schema })
  : null as any;
