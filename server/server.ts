import express from "express";
import { createServer } from "http";
import path from "path";
import fs from "fs";
import { setupAuth } from "./replit_integrations/auth/index.js";
import { db, initDatabaseTables, isDbAvailable } from "./db.js";
import { empreendimentos, clientes, vendas, appConfig } from "../shared/schema.js";
import { eq, and, ne } from "drizzle-orm";
import type { RequestHandler } from "express";
import { localUsersService } from "./localUsersService.js";
import { supabase } from "./supabase.js";
import { gerarContratoParceladoPadrao } from "./contratoParceladoPadrao.js";
import { gerarReciboAVistaPadrao } from "./reciboAVistaPadrao.js";
import { GoogleGenAI } from "@google/genai";
import jwt from "jsonwebtoken";

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── MODO COM LOGIN ────────────────────────────────────────────────────────────
const AUTH_ENABLED = true;
const DEFAULT_USER_ID = "default";
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || "rumo-ao-milhao-jwt-secret-2025";
// ─────────────────────────────────────────────────────────────────────────────

// In-Memory Data Storage Fallback
const inMemoryEmpreendimentos = new Map<string, any>();
const inMemoryClientes = new Map<string, any>();
const inMemoryVendas = new Map<string, any>();
let inMemoryConfig: any = { theme: "standard" };

let geminiAIClient: GoogleGenAI | null = null;
function getGeminiAI(): GoogleGenAI | null {
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  if (!geminiAIClient) {
    geminiAIClient = new GoogleGenAI({
      apiKey,
      ...(process.env.AI_INTEGRATIONS_GEMINI_BASE_URL ? {
        httpOptions: { apiVersion: "", baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL },
      } : {}),
    });
  }
  return geminiAIClient;
}

const GEMINI_MODEL = "gemini-2.5-flash";

async function geminiText(prompt: string): Promise<string> {
  const client = getGeminiAI();
  if (!client) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts: [{ text: prompt }] }],
  });
  return response.text ?? "{}";
}

async function geminiMultipart(parts: any[]): Promise<string> {
  const client = getGeminiAI();
  if (!client) {
    throw new Error("GEMINI_API_KEY não configurada.");
  }
  const response = await client.models.generateContent({
    model: GEMINI_MODEL,
    contents: [{ role: "user", parts }],
  });
  return response.text ?? "{}";
}

// --- JWT Auth helpers ---
function signToken(payload: { id: string; email: string; isAdmin?: boolean }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

function verifyToken(token: string): { id: string; email: string; isAdmin?: boolean } | null {
  try {
    return jwt.verify(token, JWT_SECRET) as { id: string; email: string; isAdmin?: boolean };
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

  // JWT token
  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.jwtUser = payload;
      return next();
    }
  }

  // Sessão Express
  if ((req.session as any)?.localUser?.id) return next();
  if (req.isAuthenticated?.() && req.user?.claims?.sub) return next();

  return res.status(401).json({ message: "Unauthorized" });
};

// Dados compartilhados entre todos os usuários autenticados da empresa.
const SHARED_DATA_USER = "shared";

function getUserId(_req: any): string {
  return SHARED_DATA_USER;
}

function getRequestUser(req: any) {
  return req.jwtUser || (req.session as any)?.localUser || req.user?.claims;
}

// Middleware: only admin users can proceed
const isAdminUser: RequestHandler = async (req: any, res, next) => {
  const user = getRequestUser(req);
  if (!user?.id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const dbUser = await localUsersService.findById(user.id);
    if (!dbUser?.is_admin && !user.isAdmin) return res.status(403).json({ error: "Acesso restrito ao administrador." });
    next();
  } catch {
    res.status(500).json({ error: "Erro ao verificar permissão." });
  }
};

// POST /api/auth/register
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

// POST /api/admin/users
app.post("/api/admin/users", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { email, password, isAdmin } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    }
    const existing = await localUsersService.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }
    const user = await localUsersService.create({ id: `lu-${Date.now()}`, email, password, isAdmin: isAdmin || false });
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin, createdAt: user.created_at, permissions: user.permissions ?? {} });
  } catch (e: any) {
    console.error("Create user error:", e);
    res.status(500).json({ error: e?.message || "Erro ao criar usuário." });
  }
});

// GET /api/admin/users
app.get("/api/admin/users", isAuthenticated, isAdminUser, async (_req, res) => {
  try {
    const rows = await localUsersService.listAll();
    res.json(rows.map(u => ({ id: u.id, email: u.email, isAdmin: u.is_admin, createdAt: u.created_at, permissions: u.permissions ?? {}, profile: u.profile ?? {} })));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

// PATCH /api/admin/users/:id/profile
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

// DELETE /api/admin/users/:id
app.delete("/api/admin/users/:id", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    const requester = getRequestUser(req);
    if (id === requester?.id) return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
    await localUsersService.deleteById(id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

// PATCH /api/admin/users/:id/permissions
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

// GET /api/auth/profile
app.get("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  try {
    const reqUser = getRequestUser(req);
    const user = await localUsersService.findById(reqUser?.id || "");
    if (!user) return res.status(404).json({ error: "Usuário não encontrado." });
    res.json(user.profile ?? {});
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar perfil." });
  }
});

// PATCH /api/auth/profile
app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  try {
    const reqUser = getRequestUser(req);
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(reqUser?.id || "", { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar perfil." });
  }
});

// POST /api/auth/login
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

    if (req.session) {
      (req.session as any).localUser = { id: user.id, email: user.email, isAdmin: user.is_admin };
    }

    const token = signToken({ id: user.id, email: user.email, isAdmin: user.is_admin });
    res.json({
      id: user.id,
      email: user.email,
      isAdmin: user.is_admin,
      permissions: user.permissions ?? {},
      profile: user.profile ?? {},
      token,
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

// GET /api/auth/user
app.get("/api/auth/user", async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!AUTH_ENABLED) {
    return res.json({ id: DEFAULT_USER_ID, email: "admin@sistema.local", isAdmin: true, permissions: {} });
  }

  const token = extractToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      try {
        const row = await localUsersService.findById(payload.id);
        return res.json({
          id: payload.id,
          email: row?.email ?? payload.email,
          isAdmin: row?.is_admin ?? payload.isAdmin ?? false,
          permissions: row?.permissions ?? {},
          profile: row?.profile ?? {},
        });
      } catch {
        return res.json({ id: payload.id, email: payload.email, isAdmin: payload.isAdmin ?? false, permissions: {}, profile: {} });
      }
    }
    return res.status(401).json({ message: "Token inválido." });
  }

  const localUser = (req.session as any)?.localUser;
  if (localUser?.id) {
    try {
      const row = await localUsersService.findById(localUser.id);
      return res.json({
        id: localUser.id,
        email: row?.email ?? localUser.email,
        isAdmin: row?.is_admin ?? localUser.isAdmin ?? false,
        permissions: row?.permissions ?? {},
        profile: row?.profile ?? {},
      });
    } catch {
      return res.json({ id: localUser.id, email: localUser.email, isAdmin: false, permissions: {}, profile: {} });
    }
  }

  if (req.isAuthenticated?.()) {
    const userId = req.user?.claims?.sub;
    return res.json({ id: userId, email: req.user?.claims?.email, isAdmin: false, permissions: {} });
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
    if (supabase) {
      const { data, error } = await supabase.from("empreendimentos").select("id, data");
      if (!error && data && data.length > 0) {
        const items = data.map((r: any) => ({
          ...(r.data || {}),
          id: r.id || r.data?.id,
        }));
        for (const item of items) {
          if (item.id) inMemoryEmpreendimentos.set(item.id, item);
        }
        return res.json(items);
      }
    }
  } catch (e: any) {
    console.warn("[Empreendimentos] Supabase fetch error, falling back:", e?.message);
  }
  try {
    if (isDbAvailable) {
      const rows = await db.select().from(empreendimentos);
      if (rows && rows.length > 0) {
        return res.json(rows.map((r: any) => r.data));
      }
    }
  } catch (e: any) {
    console.warn("[Empreendimentos] DB fetch error, falling back to memory:", e?.message);
  }
  res.json(Array.from(inMemoryEmpreendimentos.values()));
});

app.post("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  try {
    const items: any[] = req.body;
    for (const item of items) {
      inMemoryEmpreendimentos.set(item.id, item);
    }
    if (supabase) {
      const rows = items.map((item) => ({
        id: item.id,
        user_id: SHARED_DATA_USER,
        data: item,
      }));
      await supabase.from("empreendimentos").upsert(rows);
    }
    if (isDbAvailable) {
      const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.userId, SHARED_DATA_USER));
      const existingIds = new Set(existing.map((e: any) => e.id));
      const newIds = new Set(items.map((e: any) => e.id));
      for (const id of existingIds) {
        if (!newIds.has(id)) {
          await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id as string), eq(empreendimentos.userId, SHARED_DATA_USER)));
        }
      }
      for (const item of items) {
        await db.insert(empreendimentos).values({ id: item.id, userId: SHARED_DATA_USER, data: item }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.json({ ok: true });
  }
});

app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });

    const prev = inMemoryEmpreendimentos.get(req.params.id) || {};
    const dataToSave = {
      ...prev,
      ...item,
      ...((!item.mapaImagemBase64 && prev.mapaImagemBase64) ? { mapaImagemBase64: prev.mapaImagemBase64 } : {}),
      ...((!item.mapaImagemLeveBase64 && prev.mapaImagemLeveBase64) ? { mapaImagemLeveBase64: prev.mapaImagemLeveBase64 } : {}),
      ...((!item.mapaImagemMedResBase64 && prev.mapaImagemMedResBase64) ? { mapaImagemMedResBase64: prev.mapaImagemMedResBase64 } : {}),
      ...((!item.mapaImagemHighResBase64 && prev.mapaImagemHighResBase64) ? { mapaImagemHighResBase64: prev.mapaImagemHighResBase64 } : {}),
      ...((!item.mapaPdfOriginalBase64 && prev.mapaPdfOriginalBase64) ? { mapaPdfOriginalBase64: prev.mapaPdfOriginalBase64 } : {}),
      ...((!item.mapaImagemUrl && prev.mapaImagemUrl) ? { mapaImagemUrl: prev.mapaImagemUrl } : {}),
      ...((!item.mapaPdfUrl && prev.mapaPdfUrl) ? { mapaPdfUrl: prev.mapaPdfUrl } : {}),
      ...((!item.mapaPdfOriginalName && prev.mapaPdfOriginalName) ? { mapaPdfOriginalName: prev.mapaPdfOriginalName } : {}),
      ...((!item.mapaPdfPagina && prev.mapaPdfPagina) ? { mapaPdfPagina: prev.mapaPdfPagina } : {}),
      ...((!item.mapaPontos && prev.mapaPontos) ? { mapaPontos: prev.mapaPontos } : {}),
      ...((!item.lotesInfo && prev.lotesInfo) ? { lotesInfo: prev.lotesInfo } : {}),
    };
    inMemoryEmpreendimentos.set(req.params.id, dataToSave);

    if (supabase) {
      await supabase.from("empreendimentos").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: dataToSave,
      });
    }
    if (isDbAvailable) {
      await db.insert(empreendimentos)
        .values({ id: req.params.id, userId: SHARED_DATA_USER, data: dataToSave })
        .onConflictDoUpdate({ target: empreendimentos.id, set: { data: dataToSave } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/empreendimentos/:id error:", e);
    res.json({ ok: true });
  }
});

app.put("/api/empreendimentos/:id/pontos", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { mapaPontos } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const existing = inMemoryEmpreendimentos.get(req.params.id) || {};
    const updatedData = { ...existing, mapaPontos };
    inMemoryEmpreendimentos.set(req.params.id, updatedData);

    if (supabase) {
      await supabase.from("empreendimentos").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: updatedData,
      });
    }
    if (isDbAvailable) {
      await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_DATA_USER, data: updatedData })
        .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: true });
  }
});

app.put("/api/empreendimentos/:id/lotes", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { lotesInfo } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const existing = inMemoryEmpreendimentos.get(req.params.id) || {};
    const updatedData = { ...existing, lotesInfo };
    inMemoryEmpreendimentos.set(req.params.id, updatedData);

    if (supabase) {
      await supabase.from("empreendimentos").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: updatedData,
      });
    }
    if (isDbAvailable) {
      await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_DATA_USER, data: updatedData })
        .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: true });
  }
});

app.put("/api/empreendimentos/:id/mapa", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { mapaImagemBase64, mapaImagemUrl, mapaPdfUrl, mapaPdfOriginalName, mapaPdfPagina } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const existing = inMemoryEmpreendimentos.get(req.params.id) || {};
    const updatedData = {
      ...existing,
      ...(mapaImagemUrl ? { mapaImagemUrl } : {}),
      ...(mapaPdfUrl ? { mapaPdfUrl } : {}),
      ...(mapaPdfOriginalName ? { mapaPdfOriginalName } : {}),
      ...(mapaPdfPagina ? { mapaPdfPagina } : {}),
      ...(mapaImagemBase64 !== undefined ? { mapaImagemBase64: mapaImagemBase64 ?? null } : {}),
    };
    inMemoryEmpreendimentos.set(req.params.id, updatedData);

    if (supabase) {
      await supabase.from("empreendimentos").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: updatedData,
      });
    }
    if (isDbAvailable) {
      await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_DATA_USER, data: updatedData })
        .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    res.json({ ok: true });
  }
});

app.delete("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  try {
    const { id } = req.params;
    inMemoryEmpreendimentos.delete(id);
    if (supabase) {
      await supabase.from("empreendimentos").delete().eq("id", id);
    }
    if (isDbAvailable) {
      await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id), eq(empreendimentos.userId, SHARED_DATA_USER)));
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.json({ ok: true });
  }
});

// --- Clientes ---
app.get("/api/clientes", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (supabase) {
      const { data, error } = await supabase.from("clientes").select("id, data");
      if (!error && data && data.length > 0) {
        const items = data.map((r: any) => ({
          ...(r.data || {}),
          id: r.id || r.data?.id,
        }));
        for (const it of items) {
          if (it.id) inMemoryClientes.set(it.id, it);
        }
        return res.json(items);
      }
    }
  } catch (e: any) {
    console.warn("[Clientes] Supabase fetch error:", e?.message);
  }
  try {
    if (isDbAvailable) {
      const rows = await db.select().from(clientes);
      if (rows && rows.length > 0) {
        return res.json(rows.map((r: any) => r.data));
      }
    }
  } catch (e: any) {
    console.warn("[Clientes] DB fetch error, falling back to memory:", e?.message);
  }
  res.json(Array.from(inMemoryClientes.values()));
});

app.get("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  const mem = inMemoryClientes.get(req.params.id);
  if (mem) return res.json(mem);
  try {
    if (supabase) {
      const { data, error } = await supabase.from("clientes").select("id, data").eq("id", req.params.id).maybeSingle();
      if (!error && data?.data) return res.json({ ...data.data, id: data.id });
    }
    if (isDbAvailable) {
      const [row] = await db.select().from(clientes).where(eq(clientes.id, req.params.id));
      if (row) return res.json(row.data);
    }
  } catch {}
  res.status(404).json({ error: "Cliente não encontrado" });
});

app.post("/api/clientes", isAuthenticated, async (req: any, res) => {
  try {
    const items: any[] = req.body;
    for (const item of items) {
      inMemoryClientes.set(item.id, item);
    }
    if (supabase) {
      const rows = items.map((item) => ({
        id: item.id,
        user_id: SHARED_DATA_USER,
        data: item,
      }));
      await supabase.from("clientes").upsert(rows);
    }
    if (isDbAvailable) {
      const existing = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.userId, SHARED_DATA_USER));
      const existingIds = new Set(existing.map((e: any) => e.id));
      const newIds = new Set(items.map((e: any) => e.id));
      for (const id of existingIds) {
        if (!newIds.has(id)) {
          await db.delete(clientes).where(and(eq(clientes.id, id as string), eq(clientes.userId, SHARED_DATA_USER)));
        }
      }
      for (const item of items) {
        await db.insert(clientes).values({ id: item.id, userId: SHARED_DATA_USER, data: item }).onConflictDoUpdate({ target: clientes.id, set: { data: item } });
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.json({ ok: true });
  }
});

app.put("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    inMemoryClientes.set(req.params.id, item);
    if (supabase) {
      await supabase.from("clientes").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: item,
      });
    }
    if (isDbAvailable) {
      await db.insert(clientes)
        .values({ id: req.params.id, userId: SHARED_DATA_USER, data: item })
        .onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/clientes/:id error:", e);
    res.json({ ok: true });
  }
});

app.delete("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  try {
    inMemoryClientes.delete(req.params.id);
    if (supabase) {
      await supabase.from("clientes").delete().eq("id", req.params.id);
    }
    if (isDbAvailable) {
      await db.delete(clientes).where(and(eq(clientes.id, req.params.id), eq(clientes.userId, SHARED_DATA_USER)));
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/clientes/:id error:", e);
    res.json({ ok: true });
  }
});

// --- Vendas ---
app.get("/api/vendas", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (supabase) {
      const { data, error } = await supabase.from("vendas").select("id, data");
      if (!error && data && data.length > 0) {
        const items = data.map((r: any) => ({
          ...(r.data || {}),
          id: r.id || r.data?.id,
        }));
        for (const it of items) {
          if (it.id) inMemoryVendas.set(it.id, it);
        }
        return res.json(items);
      }
    }
  } catch (e: any) {
    console.warn("[Vendas] Supabase fetch error:", e?.message);
  }
  try {
    if (isDbAvailable) {
      const rows = await db.select().from(vendas);
      if (rows && rows.length > 0) {
        return res.json(rows.map((r: any) => r.data));
      }
    }
  } catch (e: any) {
    console.warn("[Vendas] DB fetch error, falling back to memory:", e?.message);
  }
  res.json(Array.from(inMemoryVendas.values()));
});

app.post("/api/vendas", isAuthenticated, async (req: any, res) => {
  try {
    const items: any[] = req.body;
    for (const item of items) {
      inMemoryVendas.set(item.id, item);
    }
    if (supabase) {
      const rows = items.map((item) => ({
        id: item.id,
        user_id: SHARED_DATA_USER,
        data: item,
      }));
      await supabase.from("vendas").upsert(rows);
    }
    if (isDbAvailable) {
      const existing = await db.select({ id: vendas.id }).from(vendas).where(eq(vendas.userId, SHARED_DATA_USER));
      const existingIds = new Set(existing.map((e: any) => e.id));
      const newIds = new Set(items.map((e: any) => e.id));
      for (const id of existingIds) {
        if (!newIds.has(id)) {
          await db.delete(vendas).where(and(eq(vendas.id, id as string), eq(vendas.userId, SHARED_DATA_USER)));
        }
      }
      for (const item of items) {
        await db.insert(vendas).values({ id: item.id, userId: SHARED_DATA_USER, data: item }).onConflictDoUpdate({ target: vendas.id, set: { data: item } });
      }
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.json({ ok: true });
  }
});

app.put("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    inMemoryVendas.set(req.params.id, item);
    if (supabase) {
      await supabase.from("vendas").upsert({
        id: req.params.id,
        user_id: SHARED_DATA_USER,
        data: item,
      });
    }
    if (isDbAvailable) {
      await db.insert(vendas)
        .values({ id: req.params.id, userId: SHARED_DATA_USER, data: item })
        .onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("PUT /api/vendas/:id error:", e);
    res.json({ ok: true });
  }
});

app.delete("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  try {
    inMemoryVendas.delete(req.params.id);
    if (supabase) {
      await supabase.from("vendas").delete().eq("id", req.params.id);
    }
    if (isDbAvailable) {
      await db.delete(vendas).where(and(eq(vendas.id, req.params.id), eq(vendas.userId, SHARED_DATA_USER)));
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error("DELETE /api/vendas/:id error:", e);
    res.json({ ok: true });
  }
});

// --- App Config ---
app.get("/api/config", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (supabase) {
      const { data, error } = await supabase.from("app_config").select("data").limit(1);
      if (!error && data && data.length > 0 && data[0].data) {
        inMemoryConfig = data[0].data;
        return res.json(data[0].data);
      }
    }
  } catch (e: any) {
    console.warn("[Config] Supabase fetch error:", e?.message);
  }
  try {
    if (isDbAvailable) {
      const [row] = await db.select().from(appConfig);
      if (row?.data) return res.json(row.data);
    }
  } catch (e: any) {
    console.warn("[Config] DB fetch error, falling back to memory:", e?.message);
  }
  res.json(inMemoryConfig);
});

app.post("/api/config", isAuthenticated, async (req: any, res) => {
  try {
    const config = req.body;
    inMemoryConfig = config;
    if (supabase) {
      await supabase.from("app_config").upsert({
        user_id: SHARED_DATA_USER,
        data: config,
      });
    }
    if (isDbAvailable) {
      await db.insert(appConfig).values({ userId: SHARED_DATA_USER, data: config }).onConflictDoUpdate({ target: appConfig.userId, set: { data: config } });
    }
    res.json({ ok: true });
  } catch (e: any) {
    console.error(e);
    res.json({ ok: true });
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
    const userRow = await localUsersService.findById(getRequestUser(req)?.id || "");
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

// --- Contrato À Vista Padrão ---
app.post("/api/contrato/avista-padrao", isAuthenticated, async (req: any, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda) {
      return res.status(400).json({ error: "Dados incompletos para gerar o recibo à vista." });
    }
    const userRow = await localUsersService.findById(getRequestUser(req)?.id || "");
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

// --- Preload Supabase Data into Memory Cache ---
async function preloadSupabaseData() {
  if (!supabase) return;
  try {
    const { data: emps, error: errEmps } = await supabase.from("empreendimentos").select("id, data");
    if (!errEmps && emps && emps.length > 0) {
      for (const r of emps) {
        const item = { ...(r.data || {}), id: r.id || r.data?.id };
        if (item.id) inMemoryEmpreendimentos.set(item.id, item);
      }
      console.log(`[Supabase] Carregados ${inMemoryEmpreendimentos.size} empreendimentos no cache.`);
    }

    const { data: cls, error: errCls } = await supabase.from("clientes").select("id, data");
    if (!errCls && cls && cls.length > 0) {
      for (const r of cls) {
        const item = { ...(r.data || {}), id: r.id || r.data?.id };
        if (item.id) inMemoryClientes.set(item.id, item);
      }
      console.log(`[Supabase] Carregados ${inMemoryClientes.size} clientes no cache.`);
    }

    const { data: vds, error: errVds } = await supabase.from("vendas").select("id, data");
    if (!errVds && vds && vds.length > 0) {
      for (const r of vds) {
        const item = { ...(r.data || {}), id: r.id || r.data?.id };
        if (item.id) inMemoryVendas.set(item.id, item);
      }
      console.log(`[Supabase] Carregadas ${inMemoryVendas.size} vendas no cache.`);
    }

    const { data: cfg, error: errCfg } = await supabase.from("app_config").select("data").limit(1);
    if (!errCfg && cfg && cfg.length > 0 && cfg[0].data) {
      inMemoryConfig = cfg[0].data;
      console.log(`[Supabase] Configuração carregada com sucesso.`);
    }
  } catch (e: any) {
    console.warn("[Supabase] Falha ao pré-carregar dados:", e?.message);
  }
}

// --- Setup / Admin seed ---
async function seedAdminIfNeeded() {
  try {
    await localUsersService.ensureDefaultAdmin();
  } catch (e: any) {
    console.error("[Setup] Falha ao criar admin:", e?.message);
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

// POST /api/auth/setup — create first admin
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

async function startServer() {
  await initDatabaseTables();
  await setupAuth(app);

  // --- Dev: Vite middleware; Prod: static ---
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(process.cwd(), "dist/public");
    const fallbackDistPath = path.resolve(process.cwd(), "dist");
    const finalDist = fs.existsSync(distPath) ? distPath : fallbackDistPath;
    app.use(express.static(finalDist));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(finalDist, "index.html"));
    });
  } else {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === "true" ? false : undefined,
      },
      appType: "custom",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        const indexPath = path.resolve(process.cwd(), "index.html");
        let template = fs.readFileSync(indexPath, "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({
          "Content-Type": "text/html",
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0"
        }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace?.(e);
        next(e);
      }
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", async () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    await preloadSupabaseData();
    await seedAdminIfNeeded();
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});

export default app;
