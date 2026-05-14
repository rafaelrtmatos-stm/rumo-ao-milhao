import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth } from "./replit_integrations/auth/index.js";
import bcrypt from "bcryptjs";
import { db } from "./db.js";
import { empreendimentos, clientes, vendas, appConfig, localUsers } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "express";
import { gerarContratoParceladoPadrao } from "./contratoParceladoPadrao.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

await setupAuth(app);

const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

// --- Local Auth ---
const isAuthenticated: RequestHandler = (req: any, res, next) => {
  if ((req.session as any)?.localUser?.id) return next();
  if (req.isAuthenticated?.() && req.user?.claims?.sub) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

function getUserId(req: any): string {
  return (req.session as any)?.localUser?.id || req.user?.claims?.sub;
}

// POST /api/auth/register
app.post("/api/auth/register", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    }
    const existing = await db.select().from(localUsers).where(eq(localUsers.email, email.toLowerCase()));
    if (existing.length > 0) {
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const id = `lu-${Date.now()}`;
    await db.insert(localUsers).values({ id, email: email.toLowerCase(), passwordHash });
    (req.session as any).localUser = { id, email: email.toLowerCase() };
    res.json({ id, email: email.toLowerCase() });
  } catch (e: any) {
    console.error("Register error:", e);
    res.status(500).json({ error: e?.message || "Erro ao criar conta." });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Preencha e-mail e senha." });
    }
    const [user] = await db.select().from(localUsers).where(eq(localUsers.email, email.toLowerCase()));
    if (!user) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    }
    (req.session as any).localUser = { id: user.id, email: user.email };
    res.json({ id: user.id, email: user.email });
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
app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
  const localUser = (req.session as any)?.localUser;
  if (localUser) return res.json({ id: localUser.id, email: localUser.email });
  const userId = req.user?.claims?.sub;
  res.json({ id: userId, email: req.user?.claims?.email });
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
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Extraia os dados do texto abaixo e responda SOMENTE em JSON puro, sem markdown, sem explicações, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. IMPORTANTE: nascimento e dataVencimento devem estar no formato YYYY-MM-DD (ex: 1990-05-20). Campos não encontrados retorne "" ou null.\n\nTexto:\n${rawText}` }] }],
      }),
    });
    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    res.json(safeParseJson(clean));
  } catch (err: any) {
    console.error("Gemini extract-sale error:", err?.message || err);
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
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    });
    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    res.json(safeParseJson(clean));
  } catch (err: any) {
    console.error("Gemini extract-files error:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/analyze-map", isAuthenticated, async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [
          { inlineData: { mimeType, data: base64Data } },
          { text: "Analise este mapa de loteamento e extraia as informações de lotes, quadras e ruas disponíveis. Retorne APENAS JSON puro (sem markdown), no formato: {\"lotes\":[{\"quadra\":\"A\",\"lote\":\"01\",\"rua\":\"Nome da Rua\"}],\"totalLotes\":0,\"ruasEncontradas\":[\"Rua 1\"]}" },
        ]}],
      }),
    });
    const data = await response.json() as any;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const clean = text.replace(/```json|```/g, "").trim();
    res.json(safeParseJson(clean));
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
    const filename = `contrato_parcelado_padrao_-_${nomeCliente}_-_${nomeEmp}_-_L_${Date.now()}.docx`;
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
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const PORT = parseInt(process.env.PORT || "5000");
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
