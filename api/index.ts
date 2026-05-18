import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { eq, and, ne } from "drizzle-orm";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { db } from "../server/db.js";
import {
  empreendimentos,
  clientes,
  vendas,
  appConfig,
} from "../shared/schema.js";
import { gerarContratoParceladoPadrao } from "../server/contratoParceladoPadrao.js";
import { gerarReciboAVistaPadrao } from "../server/reciboAVistaPadrao.js";
import { localUsersService } from "../server/localUsersService.js";
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

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

// Configurar session store adequado para produção
const PgSession = connectPgSimple(session);
const sessionTtl = 7 * 24 * 60 * 60 * 1000;

// Criar pool do PostgreSQL para sessões
const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: 'lax',
    },
  })
);

const GEMINI_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;

const AUTH_SECRET = process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao";

const isAuthenticated: RequestHandler = (req: any, res, next) => {
  // JWT primeiro — único método confiável na Vercel (sem estado entre instâncias)
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, AUTH_SECRET) as any;
      if (decoded?.id) {
        (req as any).tokenUser = {
          id: decoded.id,
          email: decoded.email,
          isAdmin: decoded.isAdmin,
        };
        return next();
      }
    } catch {}
  }

  // Fallback: sessão Express (funciona apenas localmente)
  if ((req.session as any)?.localUser?.id) return next();

  return res.status(401).json({ message: "Unauthorized" });
};

function getRequestUser(req: any) {
  return (req.session as any)?.localUser || (req as any).tokenUser;
}

function getUserId(req: any): string {
  return getRequestUser(req)?.id;
}

const isAdminUser: RequestHandler = async (req: any, res, next) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ message: "Unauthorized" });
    const self = await localUsersService.findById(userId);
    if (!self?.is_admin) return res.status(403).json({ error: "Acesso restrito." });
    return next();
  } catch {
    return res.status(500).json({ error: "Erro ao validar administrador." });
  }
};

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


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type PdfTemplateKind = "parcelado" | "avista";

function escapeHtml(value: any): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function brl(value: any): string {
  return Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function dataExtenso(value?: string): string {
  const base = value ? new Date(String(value).split("T")[0] + "T12:00:00") : new Date();
  const meses = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return `${base.getDate()} de ${meses[base.getMonth()]} de ${base.getFullYear()}`;
}

function fillHtmlTemplate(html: string, data: any, kind: PdfTemplateKind): string {
  const { vendedor = {}, cliente = {}, empreendimento = {}, venda = {} } = data;
  const dataContrato = dataExtenso(venda.dataVenda);
  const [dia, , mesExtenso, , ano] = dataContrato.split(" ");
  const mapa: Record<string, any> = {
    "[VENDEDOR]": vendedor.nome || "",
    "[VENDEDOR_TERMO]": vendedor.nome || "",
    "[COMPRADOR]": cliente.nome || "",
    "[COMPRADOR_TERMO]": cliente.nome || "",
    "[NACIONALIDADE]": vendedor.nacionalidade || "brasileiro",
    "[NACIONALIDADE1]": cliente.nacionalidade || "brasileiro",
    "[ESTADO_CIVIL]": vendedor.estadoCivil || "",
    "[ESTADO_CIVIL1]": cliente.estadoCivil || "",
    "[RG]": vendedor.rg || "",
    "[RG1]": cliente.rg || "",
    "[CPF]": vendedor.cpf || "",
    "[CPF1]": cliente.cpf || "",
    "[RUA]": vendedor.endereco || "",
    "[RUA1]": cliente.endereco || "",
    "[NUMERO]": vendedor.numero || "",
    "[NUMERO1]": cliente.numero || "",
    "[BAIRRO]": vendedor.bairro || "",
    "[BAIRRO1]": cliente.bairro || "",
    "[CIDADE]": vendedor.cidade || empreendimento.cidade || "",
    "[CIDADE1]": cliente.cidade || "",
    "[ESTADO]": vendedor.estado || empreendimento.estado || "",
    "[ESTADO1]": cliente.estado || "",
    "[CEP]": cliente.cep || "",
    "[TELEFONE]": [cliente.telefone1, cliente.telefone2].filter(Boolean).join(" / "),
    "[EMPREENDIMENTO]": empreendimento.nome || venda.empreendimentoNome || "",
    "[LOTE]": venda.numeroLote || "",
    "[QUADRA]": venda.quadra || "",
    "[RUA_DO_LOTE]": venda.rua || "",
    "[FRENTE]": venda.medidaFrente || "___",
    "[LATERAL_DIREITA]": venda.medidaLateralDir || "___",
    "[LATERAL_ESQUERDA]": venda.medidaLateralEsq || "___",
    "[FUNDOS]": venda.medidaFundos || "___",
    "[AREA_TOTAL]": venda.areaTotal || "___",
    "[VALOR_TOTAL]": brl(venda.valorLote),
    "[VALOR_ENTRADA]": brl(venda.valorEntrada),
    "[VALOR_PARCELA]": brl(venda.valorParcela),
    "[QUANTIDADE_PARCELAS]": venda.quantidadeParcelas || "",
    "[FORMA_PAGAMENTO]": venda.formaPagamento || (kind === "avista" ? "À vista" : "Parcelado"),
    "[DIA]": dia || "",
    "[MES_EXTENSO]": mesExtenso || "",
    "[ANO]": ano || "",
    "[DATA]": dataContrato,
    "[EMISSAO]": dataContrato,
    "[EMISSAO1]": dataContrato,
    "[QUANTTERRENO]": "01",
    "[PORT]": "",
    "[TRATVENDEDOR]": "",
    "[GENEROC]": "",
    "[GENEROC2]": "",
    "[GENEROC4]": "",
    "[GENEROV]": "",
    "[GENEROV2]": "",
  };

  let out = html;
  for (const [key, value] of Object.entries(mapa)) {
    out = out.split(key).join(escapeHtml(value));
  }

  if (data.comCarimbo && kind === "avista") {
    out = out.replace("</body>", `<div class="carimbo-pago">PAGO</div></body>`);
  }

  const printCss = `
<style id="print-real-browser-pdf">
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { background: #fff !important; }
  #page-container { position: static !important; left: 0 !important; top: 0 !important; margin: 0 !important; padding: 0 !important; background: #fff !important; overflow: visible !important; }
  .pf, .page, .a4-page { width: 210mm !important; min-height: 297mm !important; margin: 0 !important; box-shadow: none !important; page-break-after: always; page-break-inside: avoid; overflow: hidden; }
  img, svg, canvas { max-width: 100%; }
  .logo, img.logo { width: 38mm; height: auto; object-fit: contain; }
  .no-break, table, tr, .assin, .assin-item { break-inside: avoid; page-break-inside: avoid; }
  .carimbo-pago { position: fixed; right: 22mm; bottom: 72mm; transform: rotate(-12deg); border: 3px solid #15803d; color: #15803d; font: 900 34pt Arial, sans-serif; padding: 4mm 8mm; opacity: .82; z-index: 20; pointer-events: none; }
</style>`;
  return out.includes("</head>") ? out.replace("</head>", `${printCss}</head>`) : `${printCss}${out}`;
}

async function renderHtmlTemplateToPdf(kind: PdfTemplateKind, payload: any): Promise<Buffer> {
  const templateName = kind === "avista" ? "recibo_avista_template.html" : "contrato_template.html";
  const templatePath = join(__dirname, "..", "attached_assets", templateName);
  const rawHtml = await fs.readFile(templatePath, "utf8");
  const html = fillHtmlTemplate(rawHtml, payload, kind);

  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1240, height: 1754, deviceScaleFactor: 1 },
    executablePath,
    headless: chromium.headless,
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: ["load", "networkidle0"] });
    await page.evaluateHandle("document.fonts && document.fonts.ready");
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: true,
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
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
    await new Promise<void>((resolve, reject) => {
      req.session.save((err: any) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const token = jwt.sign(
      { id: user.id, email: user.email, isAdmin: user.is_admin },
      AUTH_SECRET,
      { expiresIn: "7d" }
    );
    res.json({
      id: user.id,
      email: user.email,
      isAdmin: user.is_admin,
      permissions: user.permissions ?? {},
      profile: user.profile ?? {},
      token,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao entrar." });
  }
});

app.post("/api/auth/logout", (req: any, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  const u = getRequestUser(req);
  try {
    const row = await localUsersService.findById(u.id);
    res.json({
      id: u.id,
      email: row?.email ?? u.email,
      isAdmin: row?.is_admin ?? false,
      permissions: row?.permissions ?? {},
      profile: row?.profile ?? {},
    });
  } catch {
    res.json({ id: u.id, email: u.email, isAdmin: false, permissions: {}, profile: {} });
  }
});

app.get("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  const u = getRequestUser(req);
  try {
    const row = await localUsersService.findById(u.id);
    res.json({
      id: u.id,
      email: row?.email ?? u.email,
      isAdmin: row?.is_admin ?? false,
      permissions: row?.permissions ?? {},
      profile: row?.profile ?? {},
      ...(row?.profile ?? {}),
    });
  } catch {
    res.json({ id: u.id, email: u.email, isAdmin: false, permissions: {}, profile: {} });
  }
});

app.patch("/api/auth/profile", isAuthenticated, async (req: any, res) => {
  try {
    const u = getRequestUser(req);
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(u.id, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao atualizar perfil." });
  }
});

// --- Admin ---
app.get("/api/admin/users", isAuthenticated, isAdminUser, async (_req: any, res) => {
  try {
    const rows = await localUsersService.listAll();
    res.json(rows.map(r => ({ id: r.id, email: r.email, isAdmin: r.is_admin, createdAt: r.created_at, permissions: r.permissions ?? {}, profile: r.profile ?? {} })));
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao buscar usuários." });
  }
});

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
    
    const newUser = await localUsersService.create({ 
      id: `lu-${Date.now()}`, 
      email, 
      password, 
      isAdmin: isAdmin || false 
    });
    
    res.json({ id: newUser.id, email: newUser.email, isAdmin: newUser.is_admin });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao criar usuário." });
  }
});

app.delete("/api/admin/users/:id", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const requesterId = (req as any).tokenUser?.id || (req.session as any)?.localUser?.id;
    if (req.params.id === requesterId) return res.status(400).json({ error: "Você não pode excluir sua própria conta." });
    await localUsersService.deleteById(req.params.id);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: "Erro ao excluir usuário." });
  }
});

app.patch("/api/admin/users/:id/permissions", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "Permissões inválidas." });
    }
    await localUsersService.updatePermissions(req.params.id, permissions);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar permissões." });
  }
});

app.patch("/api/admin/users/:id/profile", isAuthenticated, isAdminUser, async (req: any, res) => {
  try {
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(req.params.id, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro ao salvar perfil." });
  }
});

// --- Migração de dados legados (userId individual → "shared") ---
app.post("/api/admin/migrate-to-shared", isAuthenticated, isAdminUser, async (_req: any, res) => {
  try {
    const SHARED = "shared";
    const moved = { empreendimentos: 0, clientes: 0, vendas: 0, config: 0 };

    const oldDevs = await db.select().from(empreendimentos).where(ne(empreendimentos.userId, SHARED));
    for (const row of oldDevs) {
      await db.insert(empreendimentos).values({ id: row.id, userId: SHARED, data: row.data }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: row.data } });
      await db.delete(empreendimentos).where(and(eq(empreendimentos.id, row.id), ne(empreendimentos.userId, SHARED)));
      moved.empreendimentos++;
    }

    const oldClients = await db.select().from(clientes).where(ne(clientes.userId, SHARED));
    for (const row of oldClients) {
      await db.insert(clientes).values({ id: row.id, userId: SHARED, data: row.data }).onConflictDoUpdate({ target: clientes.id, set: { data: row.data } });
      await db.delete(clientes).where(and(eq(clientes.id, row.id), ne(clientes.userId, SHARED)));
      moved.clientes++;
    }

    const oldVendas = await db.select().from(vendas).where(ne(vendas.userId, SHARED));
    for (const row of oldVendas) {
      await db.insert(vendas).values({ id: row.id, userId: SHARED, data: row.data }).onConflictDoUpdate({ target: vendas.id, set: { data: row.data } });
      await db.delete(vendas).where(and(eq(vendas.id, row.id), ne(vendas.userId, SHARED)));
      moved.vendas++;
    }

    const sharedConfig = await db.select().from(appConfig).where(eq(appConfig.userId, SHARED));
    if (sharedConfig.length === 0) {
      const oldConfigs = await db.select().from(appConfig).where(ne(appConfig.userId, SHARED));
      if (oldConfigs.length > 0) {
        await db.insert(appConfig).values({ userId: SHARED, data: oldConfigs[0].data }).onConflictDoUpdate({ target: appConfig.userId, set: { data: oldConfigs[0].data } });
        moved.config = oldConfigs.length;
      }
    }

    res.json({ ok: true, moved });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Erro na migração." });
  }
});

// --- Empreendimentos ---
// Dados compartilhados entre todos os usuários da empresa (sem filtro por userId)
const SHARED_USER = "shared";

app.get("/api/empreendimentos", isAuthenticated, async (_req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(empreendimentos).where(eq(empreendimentos.userId, SHARED_USER));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch empreendimentos" });
  }
});

app.post("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items: any[] = req.body;
    const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq(empreendimentos.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(empreendimentos).where(and(eq(empreendimentos.id, id as string), eq(empreendimentos.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(empreendimentos).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save empreendimentos" });
  }
});

// --- Clientes ---
app.get("/api/clientes", isAuthenticated, async (_req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(clientes).where(eq(clientes.userId, SHARED_USER));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch clientes" });
  }
});

app.post("/api/clientes", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items: any[] = req.body;
    const existing = await db.select({ id: clientes.id }).from(clientes).where(eq(clientes.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(clientes).where(and(eq(clientes.id, id as string), eq(clientes.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(clientes).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save clientes" });
  }
});

// --- Vendas ---
app.get("/api/vendas", isAuthenticated, async (_req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(vendas).where(eq(vendas.userId, SHARED_USER));
    res.json(rows.map((r: any) => r.data));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch vendas" });
  }
});

app.post("/api/vendas", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items: any[] = req.body;
    const existing = await db.select({ id: vendas.id }).from(vendas).where(eq(vendas.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e: any) => e.id));
    const newIds = new Set(items.map((e: any) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(vendas).where(and(eq(vendas.id, id as string), eq(vendas.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(vendas).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to save vendas" });
  }
});

// --- Endpoints atômicos individuais (evitam sobrescrever dados entre navegadores) ---

// Upsert individual de uma venda
app.put("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(vendas).values({ id: req.params.id, userId: SHARED_USER, data: item })
      .onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to upsert venda" });
  }
});

// Delete individual de uma venda
app.delete("/api/vendas/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await db.delete(vendas).where(and(eq(vendas.id, req.params.id), eq(vendas.userId, SHARED_USER)));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to delete venda" });
  }
});

// Upsert individual de um cliente
app.put("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(clientes).values({ id: req.params.id, userId: SHARED_USER, data: item })
      .onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to upsert cliente" });
  }
});

// Upsert individual de um empreendimento
app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: item })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to upsert empreendimento" });
  }
});

// --- Config ---
// Config compartilhada entre todos (tema, configurações globais)
app.get("/api/config", isAuthenticated, async (_req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [row] = await db.select().from(appConfig).where(eq(appConfig.userId, SHARED_USER));
    res.json(row ? row.data : { theme: "standard" });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch config" });
  }
});

app.post("/api/config", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await db.insert(appConfig).values({ userId: SHARED_USER, data: req.body }).onConflictDoUpdate({ target: appConfig.userId, set: { data: req.body } });
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
    const { vendedor, cliente, empreendimento, venda, outputFormat } = req.body;
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

// --- Contrato À Vista Padrão (usa recibo_avista_template.docx) ---
app.post("/api/contrato/avista-padrao", isAuthenticated, async (req: any, res: any) => {
  try {
    const { vendedor, cliente, empreendimento, venda, outputFormat } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato à vista." });
    const userRow = await localUsersService.findById((req as any).userId || req.user?.id || "");
    const corretor = { nome: userRow?.profile?.nome, creci: userRow?.profile?.creci, telefone: userRow?.profile?.telefone };
    const buffer = await gerarReciboAVistaPadrao({ corretor, vendedor, cliente, empreendimento, venda });
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

// --- PDF do Contrato Parcelado (HTML → Puppeteer/Chromium → PDF) ---
app.post("/api/contrato/parcelado-padrao-pdf", isAuthenticated, async (req: any, res: any) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o PDF." });

    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const pdfFilename = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.pdf`;

    const pdfBuffer = await renderHtmlTemplateToPdf("parcelado", { vendedor, cliente, empreendimento, venda });
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- PDF do Contrato À Vista (HTML → Puppeteer/Chromium → PDF) ---
app.post("/api/contrato/avista-padrao-pdf", isAuthenticated, async (req: any, res: any) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o PDF à vista." });

    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const pdfFilename = `contrato_avista_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.pdf`;

    const pdfBuffer = await renderHtmlTemplateToPdf("avista", { vendedor, cliente, empreendimento, venda, comCarimbo: req.body.comCarimbo });
    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default app;

// Export para Vercel Serverless Functions
export const config = {
  api: {
    bodyParser: false,
  },
};
