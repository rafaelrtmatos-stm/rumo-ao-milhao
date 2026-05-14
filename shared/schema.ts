export * from "./models/auth";

import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const localUsers = pgTable("local_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
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
