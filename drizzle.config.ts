import { defineConfig } from "drizzle-kit";

const rawUrl = process.env.DATABASE_URL;
const connectionString =
  rawUrl && rawUrl !== "DATABASE_URL" && rawUrl.startsWith("postgres")
    ? rawUrl
    : `postgresql://${process.env.PGUSER}:${process.env.PGPASSWORD}@${process.env.PGHOST}:${process.env.PGPORT || 5432}/${process.env.PGDATABASE}`;

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
