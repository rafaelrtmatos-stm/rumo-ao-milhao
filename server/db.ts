import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

// Don't throw at module load time — let handlers fail with a clear message instead
export const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : undefined,
    })
  : null as any;

export const db = process.env.DATABASE_URL
  ? drizzle(pool, { schema })
  : null as any;
