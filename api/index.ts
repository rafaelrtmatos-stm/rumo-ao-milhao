import express from "express";
import session from "express-session";
import { eq, and } from "drizzle-orm";
import type { RequestHandler } from "express";
import { db } from "../server/db.js";
import {
  empreendimentos,
  clientes,
  vendas,
  appConfig,
} from "../shared/schema.js";
import { gerarContratoParceladoPadrao } from "../server/contratoParceladoPadrao.js";
import { localUsersService } from "../server/localUsersService.js";

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

// Debug endpoint
app.get("/api/debug", (_req: any, res: any) => {
  res.json({
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
    hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
    hasSession: !!process.env.SESSION_SECRET,
    hasDb: !!process.env.DATABASE_URL,
    node: process.version,
  });
});

const sessionTtl = 7 * 24 * 60 * 60 * 1000;
app.use(
  session({
    secret: process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  })
);

const GEMINI_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const isAuthenticated: RequestHandler = (req: any, res, next) => {
  if ((req.session as any)?.localUser?.id) return next();
  return res.status(401).json({ message: "Unauthorized" });
};

function getUserId(req: any): string {
  return (req.session as any)?.localUser?.id;
}

function safeParseJson(text: string | undefined | null): any {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {}
    }
    return {};
  }
}

// --- Auth Setup ---
app.get("/api/auth/setup", async (_req, res) => {
  try {
    const count = await localUsersService.count();
    res.json({ needsSetup: count === 0 });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

app.post("/api/auth/setup", async (req: any, res) => {
  try {
    const count = await localUsersService.count();
    if (count > 0)
      return res.status(403).json({ error: "Setup já realizado." });
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    await localUsersService.create({ id: `lu-admin-${Date.now()}`, email, password, isAdmin: true });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao criar administrador." });
  }
});

// --- Auth ---
app.post("/api/auth/register", isAuthenticated, async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "E-mail e senha (mínimo 6 caracteres) são obrigatórios." });
    const existing = await localUsersService.findByEmail(email);
    if (existing)
      return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    const user = await localUsersService.create({ id: `lu-${Date.now()}`, email, password, isAdmin: false });
    res.json({ id: user.id, email: user.email });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao criar conta." });
  }
});

app.post("/api/auth/login", async (req: any, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Preencha e-mail e senha." });
    const user = await localUsersService.findByEmail(email);
    if (!user)
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    const match = await localUsersService.verifyPassword(user, password);
    if (!match)
      return res.status(401).json({ error: "E-mail ou senha incorretos." });
    (req.session as any).localUser = { id: user.id, email: user.email, isAdmin: user.is_admin };
    res.json({ id: user.id, email: user.email, isAdmin: user.is_admin });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao entrar." });
  }
});

app.post("/api/auth/logout", (req: any, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
  const u = (req.session as any)?.localUser;
  try {
    const row = await localUsersService.findById(u.id);
    res.json({ id: u.id, email: u.email, isAdmin: row?.is_admin ?? false });
  } catch {
    res.json({ id: u.id, email: u.email, isAdmin: false });
  }
});

// --- Admin ---
app.get("/api/admin/users", isAuthenticated, async (req: any, res) => {
  try {
    const u = (req.session as any)?.localUser;
    const self = await localUsersService.findById(u.id);
    if (!self?.is_admin) return res.status(403).json({ error: "Acesso restrito." });
    const rows = await localUsersService.listAll();
    res.json(rows.map(r => ({ id: r.id, email: r.email, isAdmin: r.is_admin, createdAt: r.created_at })));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

app.delete("/api/admin/users/:id", isAuthenticated, async (req: any, res) => {
  try {
    const u = (req.session as any)?.localUser;
    const self = await localUsersService.findById(u.id);
    if (!self?.is_admin) return res.status(403).json({ error: "Acesso restrito." });
    if (req.params.id === u.id) return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
    await localUsersService.deleteById(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

// --- Empreendimentos ---
app.get("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  try {
    const rows = await db.select().from(empreendimentos).where(eq(empreendimentos.userId, getUserId(req)));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch empreendimentos" });
  }
});

app.post("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id as string), eq(empreendimentos.userId, userId)));
    for (const item of items)
      await db.insert(empreendimentos).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save empreendimentos" });
  }
});

// --- Clientes ---
app.get("/api/clientes", isAuthenticated, async (req: any, res) => {
  try {
    const rows = await db.select().from(clientes).where(eq(clientes.userId, getUserId(req)));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch clientes" });
  }
});

app.post("/api/clientes", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(clientes).where(and(eq(clientes.id, id as string), eq(clientes.userId, userId)));
    for (const item of items)
      await db.insert(clientes).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save clientes" });
  }
});

// --- Vendas ---
app.get("/api/vendas", isAuthenticated, async (req: any, res) => {
  try {
    const rows = await db.select().from(vendas).where(eq(vendas.userId, getUserId(req)));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch vendas" });
  }
});

app.post("/api/vendas", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const items: any[] = req.body;
    const existing = await db.select({ id: vendas.id }).from(vendas).where(eq(vendas.userId, userId));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(vendas).where(and(eq(vendas.id, id as string), eq(vendas.userId, userId)));
    for (const item of items)
      await db.insert(vendas).values({ id: item.id, userId, data: item }).onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save vendas" });
  }
});

// --- Config ---
app.get("/api/config", isAuthenticated, async (req: any, res) => {
  try {
    const [row] = await db.select().from(appConfig).where(eq(appConfig.userId, getUserId(req)));
    res.json(row ? row.data : { theme: "standard" });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch config" });
  }
});

app.post("/api/config", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    await db.insert(appConfig).values({ userId, data: req.body }).onConflictDoUpdate({ target: appConfig.userId, set: { data: req.body } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save config" });
  }
});

// --- Gemini ---
app.post("/api/gemini/extract-sale", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Extraia os dados do texto abaixo e responda SOMENTE em JSON puro, sem markdown, sem explicações, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. IMPORTANTE: nascimento e dataVencimento devem estar no formato YYYY-MM-DD. Campos não encontrados retorne "" ou null.\n\nTexto:\n${rawText}` }] }],
      }),
    });
    const data = (await response.json()) as any;
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/smart-paste", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    if (!rawText?.trim()) return res.status(400).json({ error: "Texto vazio." });
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Extraia os dados do texto abaixo e retorne APENAS um JSON válido, sem markdown, sem explicação.\n\nTexto:\n${rawText}\n\nRetorne exatamente neste formato:\n{"nome":"","nacionalidade":"","rg":"","cpf":"","estadoCivil":"","profissao":"","nascimento":"YYYY-MM-DD","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","lote":"","quadra":"","empreendimento":"","valorTotal":0,"entrada":0,"numeroParcelas":0,"valorParcela":0,"diaVencimento":""}` }] }],
      }),
    });
    const data = (await response.json()) as any;
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

app.post("/api/gemini/extract-files", isAuthenticated, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files?.length)
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const parts: any[] = files.map((f: any) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }));
    parts.push({ text: `Extraia os dados dos documentos e responda SOMENTE em JSON puro, sem markdown, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. Campos não encontrados: "" ou null.` });
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] }),
    });
    const data = (await response.json()) as any;
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err: any) {
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
          { text: `Analise este mapa de loteamento e extraia as informações de lotes, quadras e ruas. Retorne APENAS JSON puro (sem markdown): {"lotes":[{"quadra":"A","lote":"01","rua":"Nome da Rua"}],"totalLotes":0,"ruasEncontradas":["Rua 1"]}` },
        ]}],
      }),
    });
    const data = (await response.json()) as any;
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- Contrato ---
app.post("/api/contrato/parcelado-padrao", isAuthenticated, async (req, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato." });
    const buffer = await gerarContratoParceladoPadrao({ vendedor, cliente, empreendimento, venda });
    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const filename = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Contrato à vista: usa o mesmo template do parcelado com parcelas zeradas
app.post("/api/contrato/avista-padrao", isAuthenticated, async (req, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato." });
    // Para à vista, zera parcelas e vencimento
    const vendaAvista = {
      ...venda,
      quantidadeParcelas: 0,
      valorParcela: 0,
      dataVencimento: "",
    };
    const buffer = await gerarContratoParceladoPadrao({ vendedor, cliente, empreendimento, venda: vendaAvista });
    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const filename = `contrato_avista_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default app;
