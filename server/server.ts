import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./replit_integrations/auth/index.js";
import { db } from "./db.js";
import { empreendimentos, clientes, vendas, appConfig } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "express";
import { localUsersService } from "./localUsersService.js";
import { gerarContratoParceladoPadrao } from "./contratoParceladoPadrao.js";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

await setupAuth(app);

// ── MODO COM LOGIN ────────────────────────────────────────────────────────────
const AUTH_ENABLED = true;
const DEFAULT_USER_ID = "default";
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

// --- Local Auth ---
const isAuthenticated: RequestHandler = (req: any, res, next) => {
  if (!AUTH_ENABLED) return next();
  if ((req.session as any)?.localUser?.id) return next();
  if (req.isAuthenticated?.() && req.user?.claims?.sub) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

function getUserId(req: any): string {
  if (!AUTH_ENABLED) return DEFAULT_USER_ID;
  return (req.session as any)?.localUser?.id || req.user?.claims?.sub;
}

// Middleware: only admin users can proceed
const isAdminUser: RequestHandler = async (req: any, res, next) => {
  const localUser = (req.session as any)?.localUser;
  if (!localUser?.id) return res.status(401).json({ error: "Não autenticado." });
  try {
    const user = await localUsersService.findById(localUser.id);
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
    res.json(rows.map(u => ({ id: u.id, email: u.email, isAdmin: u.is_admin, createdAt: u.created_at, permissions: u.permissions ?? {} })));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

// DELETE /api/admin/users/:id — delete user (admin only, cannot delete self)
app.delete("/api/admin/users/:id", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { id } = req.params;
    const selfId = (req.session as any)?.localUser?.id;
    if (id === selfId) return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
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
    (req.session as any).localUser = { id: user.id, email: user.email };
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin, permissions: (user as any).permissions ?? {} });
  } catch (e: any) {
    console.error("Login error:", e);
    res.status(500).json({ error: e?.message || "Erro ao entrar." });
  }
});

// POST /api/auth/logout
app.post("/api/auth/logout", (req: any, res) => {
  (req.session as any).localUser = null;
  req.session.destroy(() => res.json({ ok: true }));
});

// GET /api/auth/user — override the one from registerAuthRoutes
app.get("/api/auth/user", async (req: any, res) => {
  if (!AUTH_ENABLED) {
    return res.json({ id: DEFAULT_USER_ID, email: "admin@sistema.local", isAdmin: true });
  }
  const localUser = (req.session as any)?.localUser;
  if (!localUser?.id && !req.isAuthenticated?.()) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (localUser) {
    try {
      const row = await localUsersService.findById(localUser.id);
      return res.json({ id: localUser.id, email: localUser.email, isAdmin: row?.is_admin ?? false, permissions: (row as any)?.permissions ?? {} });
    } catch {
      return res.json({ id: localUser.id, email: localUser.email, isAdmin: false, permissions: {} });
    }
  }
  const userId = req.user?.claims?.sub;
  res.json({ id: userId, email: req.user?.claims?.email, isAdmin: false });
});

function safeParseJson(text: string | undefined | null): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try { return JSON.parse(match[1].trim()); } catch {}
    }
    return {};
  }
}

// --- Empreendimentos ---
app.get("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
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

// Smart paste: structured prompt tuned for the CADASTRO DO COMPRADOR format
app.post("/api/gemini/smart-paste", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText?.trim()) return res.status(400).json({ error: "Texto vazio." });

    const prompt = `Extraia os dados do texto abaixo e retorne APENAS um JSON válido, sem markdown, sem explicação.

Texto:
${rawText}

Retorne exatamente neste formato:
{
  "nome": "",
  "nacionalidade": "",
  "rg": "",
  "cpf": "",
  "estadoCivil": "",
  "profissao": "",
  "nascimento": "YYYY-MM-DD",
  "endereco": "",
  "numero": "",
  "bairro": "",
  "cidade": "",
  "estado": "",
  "cep": "",
  "telefone1": "",
  "telefone2": "",
  "lote": "",
  "quadra": "",
  "empreendimento": "",
  "valorTotal": 0,
  "entrada": 0,
  "numeroParcelas": 0,
  "valorParcela": 0,
  "diaVencimento": ""
}

Regras:
- nascimento: converta DD/MM/YYYY para YYYY-MM-DD
- cpf: mantenha a máscara 000.000.000-00
- rg: inclua órgão emissor se houver (ex: 35328010 SSP AM)
- telefone1 e telefone2: apenas dígitos (sem formatação), ex: 92990725820
- cep: apenas dígitos, ex: 69085190
- estadoCivil: normalize para Solteiro, Solteira, Casado, Casada, Divorciado, Divorciada, Viúvo, Viúva ou União Estável
- nacionalidade: ex: Brasileira, Brasileira nata, Portuguesa (capitalize primeira letra)
- profissao: texto simples, ex: Agricultor, Vendedor, Autônomo
- valorTotal, entrada, valorParcela: apenas número decimal, sem R$ ou pontos, ex: 18000.00
- numeroParcelas: apenas o número inteiro
- diaVencimento: apenas o número do dia, ex: 20
- Se um campo não existir no texto, retorne string vazia ou 0`;

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
app.post("/api/contrato/parcelado-padrao", isAuthenticated, async (req, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda) {
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato." });
    }
    const buffer = await gerarContratoParceladoPadrao({ vendedor, cliente, empreendimento, venda });
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
  // SPA fallback — only for non-API routes
  app.use("*", async (req, res, next) => {
    if (req.originalUrl.startsWith("/api/")) return next();
    try {
      const url = req.originalUrl;
      let template = await vite.transformIndexHtml(url, `<!doctype html><html><head></head><body><div id="root"></div></body></html>`);
      // Load the actual index.html
      const fs = await import("fs");
      const indexPath = path.resolve(__dirname, "../index.html");
      const rawHtml = fs.readFileSync(indexPath, "utf-8");
      template = await vite.transformIndexHtml(url, rawHtml);
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
