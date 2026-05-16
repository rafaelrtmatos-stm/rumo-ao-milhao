
import { pgTable, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";

export const localUsers = pgTable("local_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  permissions: jsonb("permissions").$type<Record<string, boolean>>().default({}),
  profile: jsonb("profile").$type<{ nome?: string; creci?: string; telefone?: string }>().default({}),
  createdAt: timestamp("created_at").defaultNow(),
});

export const empreendimentos = pgTable("empreendimentos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vendas = pgTable("vendas", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const appConfig = pgTable("app_config", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").notNull().default({ theme: "standard" }),
  createdAt: timestamp("created_at").defaultNow(),
});
