import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
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

const DATA_DIR = path.resolve(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "local_users.json");

// In-memory store
const inMemoryUsers = new Map<string, LocalUser>();

function loadUsersFromFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(USERS_FILE)) {
      const raw = fs.readFileSync(USERS_FILE, "utf-8");
      const list = JSON.parse(raw);
      for (const u of list) {
        inMemoryUsers.set(u.id, {
          ...u,
          created_at: u.created_at ? new Date(u.created_at) : new Date(),
        });
      }
    }
  } catch (e) {
    console.warn("[LocalUsers] Erro ao carregar usuários do arquivo:", e);
  }
}

function saveUsersToFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const list = Array.from(inMemoryUsers.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (e) {
    console.warn("[LocalUsers] Erro ao salvar usuários no arquivo:", e);
  }
}

function ensureDefaultAdmin() {
  const adminPassword = process.env.ADMIN_PASSWORD || "Geper3tp@";
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  const defaultEmails = [
    "rafaelrtamatos@gmail.com.br",
    "rafaelrtmatos@gmail.com.br",
    "rafaelrtmatos@gmail.com",
    process.env.ADMIN_EMAIL,
  ].filter(Boolean) as string[];

  let seeded = false;
  for (const email of defaultEmails) {
    const normalized = email.toLowerCase().trim();
    const existing = Array.from(inMemoryUsers.values()).find(
      (u) => u.email.toLowerCase() === normalized
    );
    if (!existing) {
      const id = `lu-admin-${normalized.replace(/[^a-z0-9]/g, "_")}`;
      const user: LocalUser = {
        id,
        email: normalized,
        password_hash: passwordHash,
        is_admin: true,
        permissions: {
          dashboard: true,
          vendas: true,
          empreendimentos: true,
          proprietarios: true,
          mapa: true,
          tabela: true,
          contratos: true,
          clientes: true,
          aniversarios: true,
          calculadora: true,
          config: true,
          usuarios: true,
        },
        profile: {
          nome: "Rafael Matos (Administrador)",
        },
        created_at: new Date(),
      };
      inMemoryUsers.set(id, user);
      seeded = true;
    } else {
      let updated = false;
      if (!existing.is_admin) {
        existing.is_admin = true;
        updated = true;
      }
      if (!bcrypt.compareSync(adminPassword, existing.password_hash)) {
        existing.password_hash = passwordHash;
        updated = true;
      }
      if (updated) {
        inMemoryUsers.set(existing.id, existing);
        seeded = true;
      }
    }
  }
  if (seeded) {
    saveUsersToFile();
    console.log("[LocalUsers] Administrador(es) padrão sincronizados com sucesso.");
  }
}

// Inicializar na carga do módulo
loadUsersFromFile();
ensureDefaultAdmin();

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
        const c = Number(result?.count ?? 0);
        if (c > 0) return c;
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
      permissions: {
        empreendimentos: true,
        mapa: true,
        tabela: true,
        contratos: true,
        clientes: true,
        aniversarios: true,
        calculadora: true,
        config: true,
        usuarios: params.isAdmin,
      },
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
          saveUsersToFile();
          return u;
        }
      }
    } catch (e: any) {
      console.warn("[LocalUsers] DB create fallback to memory:", e?.message);
    }
    inMemoryUsers.set(userObj.id, userObj);
    saveUsersToFile();
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
    saveUsersToFile();
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
      saveUsersToFile();
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
      saveUsersToFile();
    }
  },

  ensureDefaultAdmin,
};
