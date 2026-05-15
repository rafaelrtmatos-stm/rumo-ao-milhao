import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === "production";

function getConnectionConfig() {
  const rawUrl = process.env.DATABASE_URL;
  if (rawUrl && rawUrl !== "DATABASE_URL" && rawUrl.startsWith("postgres")) {
    return { connectionString: rawUrl, ssl: isProduction ? { rejectUnauthorized: false } : undefined };
  }
  return {
    host: process.env.PGHOST,
    port: parseInt(process.env.PGPORT || "5432"),
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE,
    ssl: isProduction ? { rejectUnauthorized: false } : undefined,
  };
}

export const pool = new Pool({
  ...getConnectionConfig(),
  connectionTimeoutMillis: 4000,
  idleTimeoutMillis: 10000,
});

export const db = drizzle(pool, { schema });
