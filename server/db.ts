import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "../shared/schema.js";
const { Pool } = pg;

export let isDbAvailable = false;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || undefined,
  ssl: process.env.NODE_ENV === "production" && process.env.DATABASE_URL && !process.env.DATABASE_URL.includes("localhost")
    ? { rejectUnauthorized: false }
    : false,
  connectionTimeoutMillis: 2000,
  idleTimeoutMillis: 10000,
});

pool.on("error", () => {
  isDbAvailable = false;
});

export const db = drizzle(pool, { schema });

export async function initDatabaseTables() {
  if (!process.env.DATABASE_URL) {
    console.log("[DB] No DATABASE_URL configured. Running with in-memory persistence.");
    isDbAvailable = false;
    return;
  }
  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS "local_users" (
          "id" text PRIMARY KEY,
          "email" text NOT NULL UNIQUE,
          "password_hash" text NOT NULL,
          "is_admin" boolean NOT NULL DEFAULT false,
          "permissions" jsonb DEFAULT '{}',
          "profile" jsonb DEFAULT '{}',
          "created_at" timestamp DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS "empreendimentos" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL,
          "data" jsonb NOT NULL,
          "created_at" timestamp DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS "clientes" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL,
          "data" jsonb NOT NULL,
          "created_at" timestamp DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS "vendas" (
          "id" text PRIMARY KEY,
          "user_id" text NOT NULL,
          "data" jsonb NOT NULL,
          "created_at" timestamp DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS "app_config" (
          "user_id" text PRIMARY KEY,
          "data" jsonb NOT NULL DEFAULT '{"theme":"standard"}',
          "created_at" timestamp DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS "sessions" (
          "sid" varchar PRIMARY KEY,
          "sess" jsonb NOT NULL,
          "expire" timestamp NOT NULL
        );

        CREATE TABLE IF NOT EXISTS "users" (
          "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
          "email" varchar UNIQUE,
          "first_name" varchar,
          "last_name" varchar,
          "profile_image_url" varchar,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now()
        );
      `);
      isDbAvailable = true;
      console.log("[DB] PostgreSQL tables ready.");
    } finally {
      client.release();
    }
  } catch (err: any) {
    isDbAvailable = false;
    console.log("[DB] PostgreSQL unavailable, running in in-memory mode.");
  }
}
