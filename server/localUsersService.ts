import bcrypt from "bcryptjs";
import { db, isDbAvailable } from "./db.js";
import { localUsers } from "../shared/schema.js";
import { eq, count as drizzleCount } from "drizzle-orm";

export interface UserProfile {
  nome?: string;
  creci?: string;
  telefone?: string;
}

export interface LocalUser {
  id: string;
  email: string;
  password_hash: string;
  is_admin: boolean;
  permissions: Record<string, boolean>;
  profile: UserProfile;
  created_at: Date | null;
}

// In-memory fallback store
const inMemoryUsers = new Map<string, LocalUser>();

function toLocalUser(row: any): LocalUser {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.passwordHash || row.password_hash,
    is_admin: row.isAdmin ?? row.is_admin ?? false,
    permissions: row.permissions ?? {},
    profile: (row.profile as UserProfile) ?? {},
    created_at: row.createdAt ? new Date(row.createdAt) : new Date(),
  };
}

export const localUsersService = {
  async findByEmail(email: string): Promise<LocalUser | null> {
    const normalized = email.toLowerCase().trim();
    try {
      if (isDbAvailable) {
        const [row] = await db
          .select()
          .from(localUsers)
          .where(eq(localUsers.email, normalized));
        if (row) return toLocalUser(row);
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB findByEmail fallback to memory:", e?.message);
    }
    for (const u of inMemoryUsers.values()) {
      if (u.email.toLowerCase() === normalized) return u;
    }
    return null;
  },

  async findById(id: string): Promise<LocalUser | null> {
    try {
      if (isDbAvailable) {
        const [row] = await db
          .select()
          .from(localUsers)
          .where(eq(localUsers.id, id));
        if (row) return toLocalUser(row);
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB findById fallback to memory:", e?.message);
    }
    return inMemoryUsers.get(id) ?? null;
  },

  async listAll(): Promise<LocalUser[]> {
    try {
      if (isDbAvailable) {
        const rows = await db
          .select()
          .from(localUsers)
          .orderBy(localUsers.createdAt);
        return rows.map(toLocalUser);
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB listAll fallback to memory:", e?.message);
    }
    return Array.from(inMemoryUsers.values());
  },

  async count(): Promise<number> {
    try {
      if (isDbAvailable) {
        const [result] = await db.select({ count: drizzleCount() }).from(localUsers);
        return Number(result?.count ?? 0);
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB count fallback to memory:", e?.message);
    }
    return inMemoryUsers.size;
  },

  async create(params: { id: string; email: string; password: string; isAdmin: boolean }): Promise<LocalUser> {
    const passwordHash = await bcrypt.hash(params.password, 10);
    const userObj: LocalUser = {
      id: params.id,
      email: params.email.toLowerCase().trim(),
      password_hash: passwordHash,
      is_admin: params.isAdmin,
      permissions: {},
      profile: {},
      created_at: new Date(),
    };
    try {
      if (isDbAvailable) {
        const [row] = await db
          .insert(localUsers)
          .values({
            id: params.id,
            email: params.email.toLowerCase().trim(),
            passwordHash,
            isAdmin: params.isAdmin,
          })
          .returning();
        if (row) {
          const u = toLocalUser(row);
          inMemoryUsers.set(u.id, u);
          return u;
        }
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB create fallback to memory:", e?.message);
    }
    inMemoryUsers.set(userObj.id, userObj);
    return userObj;
  },

  async deleteById(id: string): Promise<void> {
    try {
      if (isDbAvailable) {
        await db.delete(localUsers).where(eq(localUsers.id, id));
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB deleteById fallback to memory:", e?.message);
    }
    inMemoryUsers.delete(id);
  },

  async verifyPassword(user: LocalUser, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  },

  async updatePermissions(id: string, permissions: Record<string, boolean>): Promise<void> {
    try {
      if (isDbAvailable) {
        await db
          .update(localUsers)
          .set({ permissions } as any)
          .where(eq(localUsers.id, id));
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB updatePermissions fallback to memory:", e?.message);
    }
    const existing = inMemoryUsers.get(id);
    if (existing) {
      existing.permissions = permissions;
    }
  },

  async updateProfile(id: string, profile: UserProfile): Promise<void> {
    try {
      if (isDbAvailable) {
        await db
          .update(localUsers)
          .set({ profile } as any)
          .where(eq(localUsers.id, id));
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB updateProfile fallback to memory:", e?.message);
    }
    const existing = inMemoryUsers.get(id);
    if (existing) {
      existing.profile = { ...existing.profile, ...profile };
    }
  },
};
