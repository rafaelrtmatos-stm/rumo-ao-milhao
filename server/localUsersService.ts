import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { localUsers } from "../shared/schema.js";
import { eq, count as drizzleCount } from "drizzle-orm";

export interface LocalUser {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  created_at: Date | null;
}

function toLocalUser(row: any): LocalUser {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.passwordHash,
    is_admin: row.isAdmin,
    created_at: row.createdAt,
  };
}

export const localUsersService = {
  async findByEmail(email: string): Promise<LocalUser | null> {
    const [row] = await db
      .select()
      .from(localUsers)
      .where(eq(localUsers.email, email.toLowerCase()));
    return row ? toLocalUser(row) : null;
  },

  async findById(id: string): Promise<LocalUser | null> {
    const [row] = await db
      .select()
      .from(localUsers)
      .where(eq(localUsers.id, id));
    return row ? toLocalUser(row) : null;
  },

  async listAll(): Promise<Pick<LocalUser, "id" | "email" | "is_admin" | "created_at">[]> {
    const rows = await db
      .select()
      .from(localUsers)
      .orderBy(localUsers.createdAt);
    return rows.map(toLocalUser);
  },

  async count(): Promise<number> {
    const [result] = await db.select({ count: drizzleCount() }).from(localUsers);
    return Number(result?.count ?? 0);
  },

  async create(params: { id: string; email: string; password: string; isAdmin: boolean }): Promise<LocalUser> {
    const passwordHash = await bcrypt.hash(params.password, 10);
    const [row] = await db
      .insert(localUsers)
      .values({
        id: params.id,
        email: params.email.toLowerCase(),
        passwordHash,
        isAdmin: params.isAdmin,
      })
      .returning();
    return toLocalUser(row);
  },

  async deleteById(id: string): Promise<void> {
    await db.delete(localUsers).where(eq(localUsers.id, id));
  },

  async verifyPassword(user: LocalUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  },
};
