import { defineConfig } from "drizzle-kit";

function getDbUrl(): string {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith("http")) {
    const { PGUSER, PGPASSWORD, PGHOST, PGPORT, PGDATABASE } = process.env;
    if (PGHOST && PGDATABASE) {
      return `postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT || 5432}/${PGDATABASE}`;
    }
  }
  if (!url) throw new Error("DATABASE_URL must be set");
  return url;
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: getDbUrl(),
  },
});
