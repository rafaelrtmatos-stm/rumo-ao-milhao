import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./replit_integrations/auth/index.js";
import { db } from "./db.js";
import { empreendimentos, clientes, vendas, appConfig } from "../shared/schema.js";
import { eq, and, ne } from "drizzle-orm";
import type { RequestHandler } from "express";
import { localUsersService } from "./localUsersService.js";
import { gerarContratoParceladoPadrao } from "./contratoParceladoPadrao.js";
import { gerarReciboAVistaPadrao } from "./reciboAVistaPadrao.js";
import { GoogleGenAI } from "@google/genai";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// CORS para Vercel (permite o frontend enviar o header Authorization)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

await setupAuth(app);

// ── MODO COM LOGIN ────────────────────────────────────────────────────────────
const AUTH_ENABLED = true;
const DEFAULT_USER_ID = "default";
const JWT_SECRET = process.env.JWT_SECRET || "rumo-ao-milhao-jwt-secret-2025";
// ─────────────────────────────────────────────────────────────────────────────

const geminiAI = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  ...(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ? {
    httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
  } : {}),
});
const GEMINI_MODEL = "gemini-2.5-flash";

async function geminiText(prompt: string): Promise<string> {
  const response = await geminiAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text ?? "{}";
}

async function geminiMultipart(parts: any[]): Promise<string> {
  const response = await geminiAI.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
  });
  return response.text ?? "{}";
}

// --- JWT Auth helpers ---
function signToken(payload: { id: string; email: string }): string {
  return jwt.sign(payload, JWT_SECRET);
}

function verifyToken(token: string): { id: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string };
  } catch {
    return null;
  }
}

function extractToken(req: any): string | null {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return null;
}

// --- Local Auth middleware ---
const isAuthenticated: RequestHandler = (req: any, res, next) => {
  if (!AUTH_ENABLED) return next();

  // JWT token (novo método — Vercel)
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.jwtUser = payload;
      return next();
    }
  }

  // Sessão Express (fallback — Replit local)
  if ((req.session as any)?.localUser?.id) return next();
  if (req.isAuthenticated?.() && req.user?.claims?.sub) return next();

  return res.status(401).json({ message: "Unauthorized" });
};

// Dados compartilhados entre todos os usuários autenticados da empresa.
// Usar um ID fixo garante que browser A e browser B vejam sempre os mesmos
// empreendimentos, clientes e vendas, independentemente de qual usuário está logado.
const SHARED_DATA_USER = "shared";

function getUserId(_req: any): string {
  return SHARED_DATA_USER;
}

// Middleware: only admin users can proceed
const isAdminUser: RequestHandler = async (req: any, res, next) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: "Não autenticado." });
  try {
    const user = await localUsersService.findById(userId);
    if (!user?.is_admin) return res.status(403).json({ error: "Acesso restrito ao administrador." });
    next();
  } catch {
    res.status(500).json({ error: "Erro ao verificar permissão." });
  }
};

// POST /api/auth/register — admin only
app.post("/api/auth/register", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    }
    const existing = await localUsersService.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }
    const user = await localUsersService.create({ id: `lu-${Date.now()}`, email, password, isAdmin: false });
    res.json({ id: user.id, email: user.email });
  } catch (e: any) {
    console.error("Register error:", e);
    res.status(500).json({ error: e?.message || "Erro ao criar usuário." });
  }
});

// POST /api/admin/users — create new user (admin only)
app.post("/api/admin/users", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    }
    const existing = await localUsersService.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }
    const user = await localUsersService.create({ id: `lu-${Date.now()}`, email, password, isAdmin: false });
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin, createdAt: user.created_at, permissions: user.permissions ?? {} });
  } catch (e: any) {
    console.error("Create user error:", e);
    res.status(500).json({ error: e?.message || "Erro ao criar usuário." });
  }
});

// GET /api/admin/users — list all users (admin only)
app.get("/api/admin/users", isAuthenticated, isAdminUser, async (_req, res) => {
  try {
    const rows = await localUsersService.listAll();
    res.json(rows.map(u => ({ id: u.id, email: u.email, isAdmin: u.is_admin, createdAt: u.created_at, permissions: u.permissions ?? {}, profile: u.profile ?? {} })));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

// PATCH /api/admin/users/:id/profile — update any user's profile (admin only)
app.patch("/api/admin/users/:id/profile", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(id, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar perfil." });
  }
});

// DELETE /api/admin/users/:id — delete user (admin only, cannot delete self)
app.delete("/api/admin/users/:id", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    // Verificar identidade real do solicitante (não o SHARED_DATA_USER)
    const requesterId = req.jwtUser?.id || (req.session as any)?.localUser?.id || req.user?.claims?.sub;
    if (id === requesterId) return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
    await localUsersService.deleteById(id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

// PATCH /api/admin/users/:id/permissions — update user permissions (admin only)
app.patch("/api/admin/users/:id/permissions", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "Permissões inválidas." });
    }
    await localUsersService.updatePermissions(id, permissions);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar permissões." });
  }
});

// GET /api/auth/profile — get current user's profile
app.get("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const user = await localUsersService.findById(userId);
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json(user.profile ?? {});
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar perfil." });
  }
});

// PATCH /api/auth/profile — update current user's own profile
app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(userId, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar perfil." });
  }
});

// POST /api/auth/login — retorna JWT token
app.post("/api/auth/login", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Preencha e-mail e senha." });
    }
    const user = await localUsersService.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    const match = await localUsersService.verifyPassword(user, password);
    if (!match) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }

    // Também salva na sessão (para compatibilidade com Replit local)
    if (req.session) {
      (req.session as any).localUser = { id: user.id, email: user.email };
    }

    const token = signToken({ id: user.id, email: user.email });
    res.json({
      id: user.id,
      email: user.email,
      isAdmin: user.is_admin,
      permissions: (user as any).permissions ?? {},
      token, // JWT para o frontend guardar
    });
  } catch (e: any) {
    console.error("Login error:", e);
    res.status(500).json({ error: e?.message || "Erro ao entrar." });
  }
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req: any, res) => {
  if (req.session) {
    (req.session as any).localUser = null;
    req.session.destroy(() => {});
  }
  res.json({ ok: true });
});

// GET /api/auth/user — verifica JWT ou sessão
app.get("/api/auth/user", async (req: any, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ id: DEFAULT_USER_ID, email: "admin@sistema.local", isAdmin: true });
  }

  // JWT token (Vercel)
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      try {
        const row = await localUsersService.findById(payload.id);
        return res.json({
          id: payload.id,
          email: payload.email,
          isAdmin: row?.is_admin ?? false,
          permissions: (row as any)?.permissions ?? {},
        });
      } catch {
        return res.json({ id: payload.id, email: payload.email, isAdmin: false, permissions: {} });
      }
    }
    return res.status(401).json({ message: "Token inválido." });
  }

  // Sessão (Replit local)
  const localUser = (req.session as any)?.localUser;
  if (localUser?.id) {
    try {
      const row = await localUsersService.findById(localUser.id);
      return res.json({ id: localUser.id, email: localUser.email, isAdmin: row?.is_admin ?? false, permissions: (row as any)?.permissions ?? {} });
    } catch {
      return res.json({ id: localUser.id, email: localUser.email, isAdmin: false, permissions: {} });
    }
  }

  // Passport (Replit OAuth)
  if (req.isAuthenticated?.()) {
    const userId = req.user?.claims?.sub;
    return res.json({ id: userId, email: req.user?.claims?.email, isAdmin: false });
  }

  return res.status(401).json({ message: "Unauthorized" });
});

function safeParseJson(text: string | undefined | null): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch {}
    }
    return {};
  }
}

// --- Empreendimentos ---
app.get("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = getUserId(req);
    const rows = await db.select().from(empreendimentos).where(eq(empreendimentos.userId, userId));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch empreendimentos" });
  }
});

app.post("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id as string), eq(empreendimentos.userId, userId)));
      }
    }
    for (const item of items) {
      await db.insert(empreendimentos).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to save empreendimentos" });
  }
});

app.delete("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;
    await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id), eq(empreendimentos.userId, userId)));
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to delete empreendimento" });
  }
});

// --- Clientes ---
app.get("/api/clientes", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = getUserId(req);
    const rows = await db.select().from(clientes).where(eq(clientes.userId, userId));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch clientes" });
  }
});

app.post("/api/clientes", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        await db.delete(clientes).where(and(eq(clientes.id, id as string), eq(clientes.userId, userId)));
      }
    }
    for (const item of items) {
      await db.insert(clientes).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to save clientes" });
  }
});

// --- Vendas ---
app.get("/api/vendas", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = getUserId(req);
    const rows = await db.select().from(vendas).where(eq(vendas.userId, userId));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch vendas" });
  }
});

app.post("/api/vendas", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: vendas.id }).from(vendas).where(eq(vendas.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds) {
      if (!newIds.has(id)) {
        await db.delete(vendas).where(and(eq(vendas.id, id as string), eq(vendas.userId, userId)));
      }
    }
    for (const item of items) {
      await db.insert(vendas).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to save vendas" });
  }
});

// --- App Config ---
app.get("/api/config", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const userId = getUserId(req);
    const [row] = await db.select().from(appConfig).where(eq(appConfig.userId, userId));
    res.json(row ? row.data : { theme: "standard" });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to fetch config" });
  }
});

app.post("/api/config", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const config = req.body;
    await db.insert(appConfig).values({ userId, data: config }).onConflictDoUpdate({ target: appConfig.userId, set: { data: config } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: "Failed to save config" });
  }
});

// --- Migração de dados legados (userId individual → "shared") ---
// Quando o sistema usava userId por usuário, os dados ficavam isolados.
// Este endpoint move tudo para o userId "shared" sem perda de dados.
app.post("/api/admin/migrate-to-shared", isAuthenticated, isAdminUser, async (_req: any, res) => {
  try {
    const SHARED = "shared";
    let moved = { empreendimentos: 0, clientes: 0, vendas: 0, config: 0 };

    // Empreendimentos
    const oldDevs = await db.select().from(empreendimentos).where(ne(empreendimentos.userId, SHARED));
    for (const row of oldDevs) {
      await db.insert(empreendimentos)
        .values({ id: row.id, userId: SHARED, data: row.data })
        .onConflictDoUpdate({ target: empreendimentos.id, set: { data: row.data } });
      await db.delete(empreendimentos).where(and(eq(empreendimentos.id, row.id), ne(empreendimentos.userId, SHARED)));
      moved.empreendimentos++;
    }

    // Clientes
    const oldClients = await db.select().from(clientes).where(ne(clientes.userId, SHARED));
    for (const row of oldClients) {
      await db.insert(clientes)
        .values({ id: row.id, userId: SHARED, data: row.data })
        .onConflictDoUpdate({ target: clientes.id, set: { data: row.data } });
      await db.delete(clientes).where(and(eq(clientes.id, row.id), ne(clientes.userId, SHARED)));
      moved.clientes++;
    }

    // Vendas
    const oldVendas = await db.select().from(vendas).where(ne(vendas.userId, SHARED));
    for (const row of oldVendas) {
      await db.insert(vendas)
        .values({ id: row.id, userId: SHARED, data: row.data })
        .onConflictDoUpdate({ target: vendas.id, set: { data: row.data } });
      await db.delete(vendas).where(and(eq(vendas.id, row.id), ne(vendas.userId, SHARED)));
      moved.vendas++;
    }

    // Config (apenas copia a mais recente se não houver shared ainda)
    const sharedConfig = await db.select().from(appConfig).where(eq(appConfig.userId, SHARED));
    if (sharedConfig.length === 0) {
      const oldConfigs = await db.select().from(appConfig).where(ne(appConfig.userId, SHARED));
      if (oldConfigs.length > 0) {
        await db.insert(appConfig)
          .values({ userId: SHARED, data: oldConfigs[0].data })
          .onConflictDoUpdate({ target: appConfig.userId, set: { data: oldConfigs[0].data } });
        moved.config = oldConfigs.length;
      }
    }

    res.json({ ok: true, moved });
  } catch (e: any) {
    console.error("migrate-to-shared error:", e);
    res.status(500).json({ error: e?.message || "Erro na migração." });
  }
});

// --- Endpoints atômicos individuais (PUT) ---
// O frontend usa PUT para upsert de um único registro sem sobrescrever os outros.
// Sem estas rotas, o upsertVenda/upsertCliente/upsertEmpreendimento retornava 404
// silencioso e a venda nunca era persistida no banco.

app.put("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(vendas)
      .values({ id: req.params.id, userId, data: item })
      .onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/vendas/:id error:", e);
    res.status(500).json({ error: e?.message || "Failed to upsert venda" });
  }
});

app.delete("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    await db.delete(vendas).where(and(eq(vendas.id, req.params.id), eq(vendas.userId, userId)));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/vendas/:id error:", e);
    res.status(500).json({ error: e?.message || "Failed to delete venda" });
  }
});

app.put("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(clientes)
      .values({ id: req.params.id, userId, data: item })
      .onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/clientes/:id error:", e);
    res.status(500).json({ error: e?.message || "Failed to upsert cliente" });
  }
});

app.delete("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    await db.delete(clientes).where(and(eq(clientes.id, req.params.id), eq(clientes.userId, userId)));
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/clientes/:id error:", e);
    res.status(500).json({ error: e?.message || "Failed to delete cliente" });
  }
});

app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(empreendimentos)
      .values({ id: req.params.id, userId, data: item })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/empreendimentos/:id error:", e);
    res.status(500).json({ error: e?.message || "Failed to upsert empreendimento" });
  }
});

// --- Gemini AI Proxy ---
app.post("/api/gemini/extract-sale", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    const prompt = `Extraia os dados do texto abaixo e responda SOMENTE em JSON puro, sem markdown, sem explicações, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. IMPORTANTE: nascimento e dataVencimento devem estar no formato YYYY-MM-DD (ex: 1990-05-20). Campos não encontrados retorne "" ou null.\n\nTexto:\n${rawText}`;
    const raw = await geminiText(prompt);
    res.json(safeParseJson(raw.replace(/```json|```/g, "").trim()));
  } catch (err: any) {
    console.error("Gemini extract-sale error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/smart-paste", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText?.trim()) return res.status(400).json({ error: "Texto vazio." });

    const prompt = `Extraia os dados do texto abaixo e retorne APENAS um JSON válido, sem markdown, sem explicação.\n\nTexto:\n${rawText}\n\nRetorne exatamente neste formato:\n{\n  "nome": "",\n  "nacionalidade": "",\n  "rg": "",\n  "cpf": "",\n  "estadoCivil": "",\n  "profissao": "",\n  "nascimento": "YYYY-MM-DD",\n  "endereco": "",\n  "numero": "",\n  "bairro": "",\n  "cidade": "",\n  "estado": "",\n  "cep": "",\n  "telefone1": "",\n  "telefone2": "",\n  "lote": "",\n  "quadra": "",\n  "empreendimento": "",\n  "valorTotal": 0,\n  "entrada": 0,\n  "numeroParcelas": 0,\n  "valorParcela": 0,\n  "diaVencimento": ""\n}\n\nRegras:\n- nascimento: converta DD/MM/YYYY para YYYY-MM-DD\n- cpf: mantenha a máscara 000.000.000-00\n- rg: inclua órgão emissor se houver (ex: 35328010 SSP AM)\n- telefone1 e telefone2: apenas dígitos (sem formatação), ex: 92990725820\n- cep: apenas dígitos, ex: 69085190\n- estadoCivil: normalize para Solteiro, Solteira, Casado, Casada, Divorciado, Divorciada, Viúvo, Viúva ou União Estável\n- nacionalidade: ex: Brasileira, Brasileira nata, Portuguesa (capitalize primeira letra)\n- profissao: texto simples, ex: Agricultor, Vendedor, Autônomo\n- valorTotal, entrada, valorParcela: apenas número decimal, sem R$ ou pontos, ex: 18000.00\n- numeroParcelas: apenas o número inteiro\n- diaVencimento: apenas o número do dia, ex: 20\n- Se um campo não existir no texto, retorne string vazia ou 0`;

    const raw = await geminiText(prompt);
    res.json(safeParseJson(raw.replace(/```json|```/g, "").trim()));
  } catch (err: any) {
    console.error("Gemini smart-paste error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/extract-files", isAuthenticated, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files || files.length === 0) {
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    }
    const parts: any[] = files.map((f: any) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }));
    parts.push({ text: `Extraia os dados dos documentos e responda SOMENTE em JSON puro, sem markdown, sem explicações, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. IMPORTANTE: nascimento e dataVencimento devem estar no formato YYYY-MM-DD (ex: 1990-05-20). Campos não encontrados: "" ou null.` });
    const raw = await geminiMultipart(parts);
    res.json(safeParseJson(raw.replace(/```json|```/g, "").trim()));
  } catch (err: any) {
    console.error("Gemini extract-files error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/analyze-map", isAuthenticated, async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    const parts = [
      { inlineData: { mimeType, data: base64Data } },
      { text: "Analise este mapa de loteamento e extraia as informações de lotes, quadras e ruas disponíveis. Retorne APENAS JSON puro (sem markdown), no formato: {\"lotes\":[{\"quadra\":\"A\",\"lote\":\"01\",\"rua\":\"Nome da Rua\"}],\"totalLotes\":0,\"ruasEncontradas\":[\"Rua 1\"]}" },
    ];
    const raw = await geminiMultipart(parts);
    res.json(safeParseJson(raw.replace(/```json|```/g, "").trim()));
  } catch (err: any) {
    console.error("Gemini analyze-map error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Contrato Parcelado Padrão ---
app.post("/api/contrato/parcelado-padrao", isAuthenticated, async (req: any, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda) {
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato." });
    }
    const userRow = await localUsersService.findById(getUserId(req));
    const corretor = { nome: userRow?.profile?.nome, creci: userRow?.profile?.creci, telefone: userRow?.profile?.telefone };
    const buffer = await gerarContratoParceladoPadrao({ corretor, vendedor, cliente, empreendimento, venda });
    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const filename = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);
  } catch (err: any) {
    console.error("Contrato generation error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Contrato À Vista Padrão (reutiliza o mesmo template com quantidadeParcelas=0) ---
app.post("/api/contrato/avista-padrao", isAuthenticated, async (req: any, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda) {
      return res.status(400).json({ error: "Dados incompletos para gerar o recibo à vista." });
    }
    const userRow = await localUsersService.findById(getUserId(req));
    const corretor = { nome: userRow?.profile?.nome, creci: userRow?.profile?.creci, telefone: userRow?.profile?.telefone };
    const buffer = await gerarReciboAVistaPadrao({ corretor, vendedor, cliente, empreendimento, venda });
    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const filename = `recibo_avista_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);
  } catch (err: any) {
    console.error("Recibo avista generation error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Dev: Vite middleware (HMR on same HTTP server); Prod: static ---
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist/public");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: {
      middlewareMode: true,
      hmr: { server: httpServer },
    },
    appType: "custom",
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) return next();
    try {
      const url = req.originalUrl;
      const fs = await import("fs");
      const indexPath = path.resolve(__dirname, "../index.html");
      const rawHtml = fs.readFileSync(indexPath, "utf-8");
      const template = await vite.transformIndexHtml(url, rawHtml);
      res.status(200).set({ "Content-Type": "text/html" }).end(template);
    } catch (e: any) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}

// --- Auto-seed first admin user on startup ---
async function seedAdminIfNeeded() {
  try {
    const count = await localUsersService.count();
    if (count === 0) {
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password) {
        console.log("[Setup] Set ADMIN_EMAIL and ADMIN_PASSWORD secrets to auto-create the first admin user.");
        return;
      }
      await localUsersService.create({ id: `lu-admin-${Date.now()}`, email, password, isAdmin: true });
      console.log(`[Setup] Admin user created: ${email}`);
    }
  } catch (e: any) {
    console.error("[Setup] Failed to seed admin:", e?.message);
  }
}

// GET /api/auth/setup — check if setup is needed
app.get("/api/auth/setup", async (_req, res) => {
  try {
    const count = await localUsersService.count();
    res.json({ needsSetup: count === 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// POST /api/auth/setup — create first admin (only works if no users exist)
app.post("/api/auth/setup", async (req: any, res) => {
  try {
    const count = await localUsersService.count();
    if (count > 0) {
      return res.status(403).json({ error: "Setup já realizado. Use o painel de administração." });
    }
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    }
    await localUsersService.create({ id: `lu-admin-${Date.now()}`, email, password, isAdmin: true });
    res.json({ ok: true, message: "Administrador criado com sucesso." });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao criar administrador." });
  }
});

const PORT = parseInt(process.env.PORT || "5000");
httpServer.listen(PORT, "0.0.0.0", async () => {
  console.log(`Server running on port ${PORT}`);
  await seedAdminIfNeeded();
});

export default app;
