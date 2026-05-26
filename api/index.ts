import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg from "pg";
import { eq, and, ne } from "drizzle-orm";
import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { join } from "path";
import { existsSync } from "fs";
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

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

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

// Configurar session store — PgSession se DATABASE_URL disponível, senão MemoryStore
const PgSession = connectPgSimple(session);
const sessionTtl = 7 * 24 * 60 * 60 * 1000;

const pgPool = process.env.DATABASE_URL ? new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
  max: 5,
  connectionTimeoutMillis: 5000,
}) : null;

// Testar conexão e logar claramente
if (pgPool) {
  pgPool.query('SELECT 1').then(() => {
    console.log('[db] Pool PostgreSQL conectado com sucesso');
  }).catch((e: any) => {
    console.error('[db] ERRO na conexão PostgreSQL:', e.message);
  });
} else {
  console.warn('[db] DATABASE_URL não definida — usando MemoryStore para sessões');
}

const sessionStore = pgPool ? new PgSession({
  pool: pgPool,
  tableName: 'session',
  createTableIfMissing: true,
}) : undefined; // undefined = MemoryStore padrão do express-session

app.use(
  session({
    ...(sessionStore ? { store: sessionStore } : {}),
    secret: process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao-2025",
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


// --- HTML/PDF helpers: renderizacao real via Puppeteer/Chromium ---

function corrigirEspacosSimplesmente(texto: string): string {
  return String(texto || "")
    .replace(/simplesmente\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    .replace(/simplesmente\s+de\s+(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    .replace(/simplesmente(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1")
    .replace(/simplesmente  +(VENDEDORA|VENDEDOR|COMPRADORA|COMPRADOR)/g, "simplesmente $1");
}

function escapeHtml(value: any): string {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function brl(value: any): string {
  const n = Number(value) || 0;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dataExtensoPdf(value: any): string {
  const d = value ? new Date(String(value).split("T")[0] + "T12:00:00") : new Date();
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  return `${d.getDate()} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function normalizarGenero(value: any): "M" | "F" {
  return String(value || "").toUpperCase().startsWith("F") ? "F" : "M";
}

function genderizeEstadoCivilPdf(raw: any, generoRaw: any): string {
  const genero = normalizarGenero(generoRaw);
  const base = String(raw || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[()]/g, "").replace(/\ba\b/g, "").replace(/_/g, " ").trim();
  const masc: Record<string, string> = { solteiro: "solteiro", casado: "casado", divorciado: "divorciado", viuvo: "viúvo", separado: "separado", "uniao estavel": "união estável" };
  const fem: Record<string, string> = { solteiro: "solteira", casado: "casada", divorciado: "divorciada", viuvo: "viúva", separado: "separada", "uniao estavel": "união estável" };
  return (genero === "F" ? fem : masc)[base] || String(raw || "").toLowerCase();
}

function generoPessoaPdf(pessoa: any, papelBase: "VENDEDOR" | "COMPRADOR") {
  const genero = normalizarGenero(pessoa?.genero);
  const fem = genero === "F";
  const papel = papelBase === "VENDEDOR" ? (fem ? "VENDEDORA" : "VENDEDOR") : (fem ? "COMPRADORA" : "COMPRADOR");
  return {
    genero,
    tratamento: fem ? "Sra." : "Sr.",
    artigo: fem ? "a" : "o",
    nacionalidade: fem ? "brasileira" : "brasileiro",
    estadoCivil: genderizeEstadoCivilPdf(pessoa?.estadoCivil, genero),
    portador: fem ? "portadora" : "portador",
    domiciliado: fem ? "domiciliada" : "domiciliado",
    chamado: fem ? "chamada" : "chamado",
    papel,
    aoA: fem ? "à" : "ao",
  };
}

function enderecoPessoaPdf(pessoa: any): string {
  return [pessoa?.endereco, pessoa?.numero ? `nº ${pessoa.numero}` : "", pessoa?.bairro ? `Bairro ${pessoa.bairro}` : "", [pessoa?.cidade, pessoa?.estado].filter(Boolean).join(" - "), pessoa?.cep ? `CEP ${pessoa.cep}` : ""].filter(Boolean).join(", ");
}

function dimensoesLotePdf(venda: any): string {
  return `${venda?.medidaFrente || "___"} metros de frente, ${venda?.medidaLateralDir || "___"} metros pela lateral direita, ${venda?.medidaLateralEsq || "___"} metros pela lateral esquerda e ${venda?.medidaFundos || "___"} metros de fundos, com área total de ${venda?.areaTotal || "___"} m²`;
}

function primeiraParcelaPdf(dateStr: any): string {
  if (!dateStr) return "___/___/______";
  const d = new Date(String(dateStr).split("T")[0] + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("pt-BR");
}

function contratoBaseCssPdf(): string {
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { font-family: "Times New Roman", serif; color: #000; }
    .page { width: 210mm; min-height: 297mm; padding: 18mm 20mm; margin: 0 auto; background: #fff; page-break-after: always; }
    .page:last-child { page-break-after: auto; }
    h1 { text-align: center; font-size: 14pt; margin: 0 0 12mm; text-transform: uppercase; }
    p { font-size: 12pt; line-height: 1.42; margin: 0 0 4mm; text-align: justify; }
    .valor { text-align: center; font-weight: bold; margin-bottom: 7mm; }
    .clausula { font-weight: bold; text-transform: uppercase; margin-top: 5mm; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 18mm; margin-top: 24mm; break-inside: avoid; page-break-inside: avoid; }
    .assinatura { text-align: center; font-size: 11pt; border-top: 1px solid #000; padding-top: 2mm; }
    .logo { width: 34mm; height: auto; object-fit: contain; }
    .avoid-break { break-inside: avoid; page-break-inside: avoid; }
  `;
}

function wrapContratoHtmlPdf(titulo: string, body: string): string {
  return corrigirEspacosSimplesmente(`<!doctype html><html><head><meta charset="utf-8"/><title>${escapeHtml(titulo)}</title><style>${contratoBaseCssPdf()}</style></head><body><main class="page">${body}</main></body></html>`);
}

function renderContratoParceladoHtmlPdf(params: any): string {
  const { vendedor, cliente, empreendimento, venda } = params;
  const gv = generoPessoaPdf(vendedor, "VENDEDOR");
  const gc = generoPessoaPdf(cliente, "COMPRADOR");
  const valorTotal = Number(venda?.valorLote) || 0;
  const entrada = Number(venda?.valorEntrada) || 0;
  const saldo = Math.max(0, valorTotal - entrada);
  const qtd = Number(venda?.quantidadeParcelas) || 0;
  const valorParcela = Number(venda?.valorParcela) || 0;
  const cidadeForum = empreendimento?.cidade || vendedor?.cidade || "Santarém";
  const estadoForum = empreendimento?.estado || vendedor?.estado || "PA";
  const phones = [cliente?.telefone1, cliente?.telefone2].filter(Boolean).join(" / ");
  const body = `
    <h1>Contrato Particular de Compra e Venda de Imóvel</h1>
    <p class="valor">R$ ${brl(valorTotal)}</p>
    <p>Pelo presente instrumento particular de compra e venda de imóvel, de um lado ${gv.artigo} ${gv.tratamento} <strong>${escapeHtml(String(vendedor?.nome || "").toUpperCase())}</strong>, ${gv.nacionalidade}, ${gv.estadoCivil}, ${gv.portador} da carteira de identidade nº ${escapeHtml(vendedor?.rg || "___")} e do CPF nº ${escapeHtml(vendedor?.cpf || "___")}, residente e ${gv.domiciliado} em ${escapeHtml(enderecoPessoaPdf(vendedor))}, ora em diante ${gv.chamado} simplesmente ${gv.papel}; e de outro lado ${gc.artigo} ${gc.tratamento} <strong>${escapeHtml(String(cliente?.nome || "").toUpperCase())}</strong>, ${gc.nacionalidade}, ${gc.estadoCivil}, ${gc.portador} da carteira de identidade nº ${escapeHtml(cliente?.rg || "___")} e do CPF nº ${escapeHtml(cliente?.cpf || "___")}${phones ? `, telefone ${escapeHtml(phones)}` : ""}, residente e ${gc.domiciliado} em ${escapeHtml(enderecoPessoaPdf(cliente))}, ora em diante ${gc.chamado} simplesmente ${gc.papel}, têm entre si justo e contratado o seguinte:</p>
    <p class="clausula">Cláusula Primeira - Do Imóvel</p>
    <p>${gv.artigo.toUpperCase()} ${gv.papel} vende ${gc.aoA} ${gc.papel} o Lote ${escapeHtml(venda?.numeroLote || "___")} da Quadra ${escapeHtml(venda?.quadra || "___")}, situado no empreendimento ${escapeHtml(empreendimento?.nome || "___")}, ${escapeHtml(empreendimento?.comunidade || "")}, ${escapeHtml(empreendimento?.cidade || "")}/${escapeHtml(empreendimento?.estado || "")}, com as seguintes dimensões: ${escapeHtml(dimensoesLotePdf(venda))}.</p>
    <p class="clausula">Cláusula Segunda - Do Preço e Pagamento</p>
    <p>O valor total da venda é de R$ ${brl(valorTotal)}, que ${gc.artigo} ${gc.papel} pagará ${gv.aoA} ${gv.papel} da seguinte forma: entrada de R$ ${brl(entrada)} e saldo de R$ ${brl(saldo)} em ${qtd} parcela(s) de R$ ${brl(valorParcela)}, com vencimento no dia ${escapeHtml(venda?.dataVencimento || "___")} de cada mês, vencendo a primeira em ${escapeHtml(primeiraParcelaPdf(venda?.dataVenda))}.</p>
    <p class="clausula">Cláusula Terceira - Da Posse e Quitação</p>
    <p>A posse definitiva será transferida ${gc.aoA} ${gc.papel} após a quitação integral. Após o pagamento total, ${gv.artigo} ${gv.papel} dará ${gc.aoA} ${gc.papel} plena, geral e irrevogável quitação.</p>
    <p>${gc.artigo.toUpperCase()} ${gc.papel} declara conhecer o imóvel e aceitá-lo nas condições em que se encontra.</p>
    <p style="text-align:center;margin-top:10mm;">${escapeHtml(cidadeForum)}-${escapeHtml(estadoForum)}, ${escapeHtml(dataExtensoPdf(venda?.dataVenda))}.</p>
    <div class="assinaturas"><div class="assinatura">${gv.papel} - ${escapeHtml(String(vendedor?.nome || "").toUpperCase())}</div><div class="assinatura">${gc.papel} - ${escapeHtml(String(cliente?.nome || "").toUpperCase())}</div></div>
  `;
  return wrapContratoHtmlPdf("Contrato Parcelado", body);
}

function renderReciboAvistaHtmlPdf(params: any): string {
  const { vendedor, cliente, empreendimento, venda } = params;
  const gv = generoPessoaPdf(vendedor, "VENDEDOR");
  const gc = generoPessoaPdf(cliente, "COMPRADOR");
  const valorTotal = Number(venda?.valorLote) || 0;
  const cidadeForum = empreendimento?.cidade || vendedor?.cidade || "Santarém";
  const estadoForum = empreendimento?.estado || vendedor?.estado || "PA";
  const body = `
    <h1>Contrato Particular de Compra e Venda de Imóvel à Vista</h1>
    <p class="valor">R$ ${brl(valorTotal)}</p>
    <p>Pelo presente instrumento particular de compra e venda de imóvel, de um lado ${gv.artigo} ${gv.tratamento} <strong>${escapeHtml(String(vendedor?.nome || "").toUpperCase())}</strong>, ${gv.nacionalidade}, ${gv.estadoCivil}, ${gv.portador} da carteira de identidade nº ${escapeHtml(vendedor?.rg || "___")} e do CPF nº ${escapeHtml(vendedor?.cpf || "___")}, residente e ${gv.domiciliado} em ${escapeHtml(enderecoPessoaPdf(vendedor))}, ora em diante ${gv.chamado} simplesmente ${gv.papel}; e de outro lado ${gc.artigo} ${gc.tratamento} <strong>${escapeHtml(String(cliente?.nome || "").toUpperCase())}</strong>, ${gc.nacionalidade}, ${gc.estadoCivil}, ${gc.portador} da carteira de identidade nº ${escapeHtml(cliente?.rg || "___")} e do CPF nº ${escapeHtml(cliente?.cpf || "___")}, residente e ${gc.domiciliado} em ${escapeHtml(enderecoPessoaPdf(cliente))}, ora em diante ${gc.chamado} simplesmente ${gc.papel}, têm entre si justo e contratado o seguinte:</p>
    <p class="clausula">Do Imóvel</p>
    <p>${gv.artigo.toUpperCase()} ${gv.papel} vende ${gc.aoA} ${gc.papel} o Lote ${escapeHtml(venda?.numeroLote || "___")} da Quadra ${escapeHtml(venda?.quadra || "___")}, situado no empreendimento ${escapeHtml(empreendimento?.nome || "___")}, ${escapeHtml(empreendimento?.cidade || "")}/${escapeHtml(empreendimento?.estado || "")}, com as seguintes dimensões: ${escapeHtml(dimensoesLotePdf(venda))}.</p>
    <p class="clausula">Do Pagamento e Quitação</p>
    <p>${gv.artigo.toUpperCase()} ${gv.papel} declara que ${gc.artigo} ${gc.papel} pagou a importância de R$ ${brl(valorTotal)}, referente à compra do imóvel descrito acima, e ${gv.artigo} ${gv.papel} recebeu o referido valor, dando ${gc.aoA} ${gc.papel} plena, geral e irrevogável quitação.</p>
    <p>${gc.artigo.toUpperCase()} ${gc.papel} declara conhecer o imóvel e aceitá-lo nas condições em que se encontra.</p>
    <p style="text-align:center;margin-top:10mm;">${escapeHtml(cidadeForum)}-${escapeHtml(estadoForum)}, ${escapeHtml(dataExtensoPdf(venda?.dataVenda))}.</p>
    <div class="assinaturas"><div class="assinatura">${gv.papel} - ${escapeHtml(String(vendedor?.nome || "").toUpperCase())}</div><div class="assinatura">${gc.papel} - ${escapeHtml(String(cliente?.nome || "").toUpperCase())}</div></div>
  `;
  return wrapContratoHtmlPdf("Contrato à Vista", body);
}

async function criarPdfPorNavegador(html: string): Promise<Buffer> {
  const puppeteer = await import("puppeteer-core");

  const gerarNoBrowser = async (browser: any) => {
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: ["load", "domcontentloaded", "networkidle0"] });
      await page.evaluateHandle("document.fonts.ready");
      const pdf = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
        preferCSSPageSize: true,
      });
      return Buffer.from(pdf);
    } finally {
      await browser.close();
    }
  };

  const browserlessWsUrl = process.env.BROWSERLESS_WS_URL || "";
  if (browserlessWsUrl) {
    const browser = await puppeteer.connect({ browserWSEndpoint: browserlessWsUrl });
    return gerarNoBrowser(browser);
  }

  let executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_EXECUTABLE_PATH || "";
  let args: string[] = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];
  let headless: any = true;
  let defaultViewport: any = { width: 794, height: 1123, deviceScaleFactor: 1 };

  try {
    const chromium = await import("@sparticuz/chromium");
    const c: any = chromium.default || chromium;
    if ("setGraphicsMode" in c) c.setGraphicsMode = false;
    executablePath = executablePath || await c.executablePath();
    args = Array.from(new Set([...(c.args || []), ...args, "--disable-extensions", "--hide-scrollbars", "--font-render-hinting=none"]));
    headless = c.headless ?? true;
    defaultViewport = c.defaultViewport || defaultViewport;
  } catch {
    const candidates = ["/usr/bin/google-chrome-stable", "/usr/bin/google-chrome", "/usr/bin/chromium-browser", "/usr/bin/chromium"];
    executablePath = executablePath || candidates.find((x) => existsSync(x)) || "";
  }

  if (!executablePath) {
    throw new Error("Chromium não encontrado. No Vercel, instale @sparticuz/chromium e puppeteer-core ou configure BROWSERLESS_WS_URL.");
  }

  try {
    const browser = await puppeteer.launch({
      executablePath,
      args,
      headless,
      defaultViewport,
      ignoreHTTPSErrors: true,
    });
    return gerarNoBrowser(browser);
  } catch (error: any) {
    const msg = String(error?.message || error || "");
    if (msg.includes("libnss3") || msg.includes("libnspr4") || msg.includes("Failed to launch")) {
      throw new Error(`Erro ao iniciar Chromium no servidor. Atualize @sparticuz/chromium/puppeteer-core no Shell e redeploy. Detalhe: ${msg}`);
    }
    throw error;
  }
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
    console.error('[auth/login] Erro:', e?.message, e?.code, e?.stack?.split('\n')[1]);
    res.status(500).json({ 
      error: e?.message || "Erro ao entrar.",
      code: e?.code,
      hint: !process.env.DATABASE_URL ? "DATABASE_URL não configurada na Vercel" : undefined
    });
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

// Upsert individual de um empreendimento (sem mapaImagemBase64 — enviada via /mapa para evitar 413)
app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
    // Preservar campos pesados existentes que não vêm no payload base (stripHeavy os remove)
    let dataToSave = item;
    const [existing] = await db
      .select()
      .from(empreendimentos)
      .where(and(eq(empreendimentos.id, req.params.id), eq(empreendimentos.userId, SHARED_USER)));
    if (existing?.data) {
      const prev = existing.data as any;
      dataToSave = {
        ...item,
        // Preservar imagens se não vieram no payload
        ...((!item.mapaImagemBase64 && prev.mapaImagemBase64) ? { mapaImagemBase64: prev.mapaImagemBase64 } : {}),
        ...((!item.mapaImagemLeveBase64 && prev.mapaImagemLeveBase64) ? { mapaImagemLeveBase64: prev.mapaImagemLeveBase64 } : {}),
        ...((!item.mapaPdfOriginalBase64 && prev.mapaPdfOriginalBase64) ? { mapaPdfOriginalBase64: prev.mapaPdfOriginalBase64 } : {}),
        // CRÍTICO: preservar mapaPontos e lotesInfo — nunca apagar bolinhas!
        ...((!item.mapaPontos && prev.mapaPontos) ? { mapaPontos: prev.mapaPontos } : {}),
        ...((!item.lotesInfo && prev.lotesInfo) ? { lotesInfo: prev.lotesInfo } : {}),
      };
    }
    await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: dataToSave })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: dataToSave } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to upsert empreendimento" });
  }
});

// Rota separada para mapaPontos (bolinhas) — evita 413
app.put("/api/empreendimentos/:id/pontos", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { mapaPontos } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const [existing] = await db.select().from(empreendimentos)
      .where(and(eq(empreendimentos.id, req.params.id), eq(empreendimentos.userId, SHARED_USER)));
    if (!existing) return res.status(404).json({ error: "Empreendimento não encontrado." });
    const updatedData = { ...(existing.data as any), mapaPontos };
    await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: updatedData })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update mapaPontos" });
  }
});

// Rota separada para lotesInfo — evita 413
app.put("/api/empreendimentos/:id/lotes", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { lotesInfo } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const [existing] = await db.select().from(empreendimentos)
      .where(and(eq(empreendimentos.id, req.params.id), eq(empreendimentos.userId, SHARED_USER)));
    if (!existing) return res.status(404).json({ error: "Empreendimento não encontrado." });
    const updatedData = { ...(existing.data as any), lotesInfo };
    await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: updatedData })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update lotesInfo" });
  }
});

// Upload separado da imagem do mapa (evita 413 — imagens base64 podem ter vários MB)
app.put("/api/empreendimentos/:id/mapa", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const { mapaImagemBase64 } = req.body;
    if (!req.params.id) return res.status(400).json({ error: "ID inválido." });
    const [existing] = await db
      .select()
      .from(empreendimentos)
      .where(and(eq(empreendimentos.id, req.params.id), eq(empreendimentos.userId, SHARED_USER)));
    if (!existing) return res.status(404).json({ error: "Empreendimento não encontrado." });
    const updatedData = { ...(existing.data as any), mapaImagemBase64: mapaImagemBase64 ?? null };
    await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: updatedData })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update mapa imagem" });
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

// --- Helper: DOCX Buffer → PDF via LibreOffice local ou API externa ---
async function convertDocxToPdfLocal(docxBuffer: Buffer, filename: string): Promise<Buffer> {
  const fs = await import("fs");
  const os = await import("os");
  const path = await import("path");
  const { execFile } = await import("child_process");
  const { promisify } = await import("util");

  const execFileAsync = promisify(execFile);
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "docx-pdf-"));
  const safeFilename = String(filename || "contrato.docx")
    .replace(/[^\w.\-]+/g, "_")
    .replace(/\.pdf$/i, ".docx");
  const docxPath = path.join(
    tempDir,
    safeFilename.toLowerCase().endsWith(".docx") ? safeFilename : `${safeFilename}.docx`
  );

  const commands = [
    process.env.LIBREOFFICE_PATH,
    "soffice",
    "libreoffice",
  ].filter(Boolean) as string[];

  try {
    fs.writeFileSync(docxPath, docxBuffer);

    let lastError: any = null;
    for (const command of commands) {
      try {
        await execFileAsync(command, [
          "--headless",
          "--nologo",
          "--nofirststartwizard",
          "--convert-to",
          "pdf",
          "--outdir",
          tempDir,
          docxPath,
        ], { timeout: 60000 });
        lastError = null;
        break;
      } catch (err: any) {
        lastError = err;
        if (err?.code !== "ENOENT") break;
      }
    }

    if (lastError) {
      throw lastError;
    }

    const pdfPath = docxPath.replace(/\.docx$/i, ".pdf");

    if (!fs.existsSync(pdfPath)) {
      throw new Error("PDF não foi gerado pelo LibreOffice.");
    }

    return fs.readFileSync(pdfPath);
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

async function convertDocxToPdfExternal(docxBuffer: Buffer, filename: string): Promise<Buffer> {
  const converterUrl = process.env.PDF_CONVERTER_API_URL;
  if (!converterUrl) throw new Error("PDF_CONVERTER_API_URL não configurada.");

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.PDF_CONVERTER_API_KEY) {
    headers["X-API-Key"] = process.env.PDF_CONVERTER_API_KEY;
  }

  const response = await fetch(converterUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filename,
      docxBase64: docxBuffer.toString("base64"),
    }),
  });

  if (!response.ok) {
    let detail = "Falha na API externa de conversão.";
    try {
      const data: any = await response.json();
      detail = data?.error || detail;
    } catch {
      try { detail = await response.text(); } catch {}
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const data: any = await response.json();
    if (!data?.pdfBase64) throw new Error("API externa não retornou pdfBase64.");
    return Buffer.from(data.pdfBase64, "base64");
  }

  return Buffer.from(await response.arrayBuffer());
}

async function convertDocxToPdfViaLibreOffice(docxBuffer: Buffer, filename: string): Promise<Buffer> {
  // 1. ILovePDF — método principal na Vercel
  const ilovepdfKey = process.env.ILOVEPDF_SECRET_KEY;
  console.log('[pdf] ILOVEPDF_SECRET_KEY configurada:', !!ilovepdfKey, ilovepdfKey ? '('+ilovepdfKey.slice(0,8)+'...)' : 'NÃO CONFIGURADA');
  if (ilovepdfKey) {
    try {
      return await convertDocxToPdfILovePDF(docxBuffer, filename, ilovepdfKey);
    } catch (e: any) {
      console.warn("[pdf] ILovePDF falhou:", e?.message);
      // Não tentar LibreOffice — não existe na Vercel
      throw new Error("Falha na conversão PDF via ILovePDF: " + e?.message);
    }
  }
  // 2. API externa configurada
  if (process.env.PDF_CONVERTER_API_URL) {
    return convertDocxToPdfExternal(docxBuffer, filename);
  }
  // 3. LibreOffice local — só funciona em servidores com LibreOffice instalado
  // Na Vercel isso vai falhar com ENOENT — configure ILOVEPDF_SECRET_KEY
  console.warn("[pdf] ILOVEPDF_SECRET_KEY não configurada — tentando LibreOffice local (vai falhar na Vercel)");
  return convertDocxToPdfLocal(docxBuffer, filename);
}

async function convertDocxToPdfILovePDF(docxBuffer: Buffer, filename: string, secretKey: string): Promise<Buffer> {
  // 1. Autenticar e obter token JWT
  const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ public_key: secretKey }),
  });
  if (!authRes.ok) throw new Error("ILovePDF auth failed: " + authRes.status);
  const { token } = await authRes.json() as { token: string };

  // 2. Iniciar task de office2pdf
  const taskRes = await fetch("https://api.ilovepdf.com/v1/start/officepdf", {
    headers: { Authorization: "Bearer " + token },
  });
  if (!taskRes.ok) throw new Error("ILovePDF start task failed: " + taskRes.status);
  const { server, task } = await taskRes.json() as { server: string; task: string };

  // 3. Upload do DOCX
  const formData = new FormData();
  formData.append("task", task);
  formData.append("file", new Blob([docxBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }), filename);
  const uploadRes = await fetch(`https://${server}/v1/upload`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: formData,
  });
  if (!uploadRes.ok) throw new Error("ILovePDF upload failed: " + uploadRes.status);
  const { server_filename } = await uploadRes.json() as { server_filename: string };

  // 4. Processar conversão
  const processRes = await fetch(`https://${server}/v1/process`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({
      task,
      tool: "officepdf",
      files: [{ server_filename, filename }],
    }),
  });
  if (!processRes.ok) throw new Error("ILovePDF process failed: " + processRes.status);

  // 5. Download do PDF
  const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!downloadRes.ok) throw new Error("ILovePDF download failed: " + downloadRes.status);
  const pdfBuffer = Buffer.from(await downloadRes.arrayBuffer());
  console.log("[pdf] ILovePDF converteu com sucesso:", pdfBuffer.length, "bytes");
  return pdfBuffer;
}

// API externa de conversão. Use esta rota no Replit/Railway/Render, onde há LibreOffice.
app.post("/api/convert-docx-to-pdf", async (req: any, res: any) => {
  try {
    const expectedKey = process.env.PDF_CONVERTER_API_KEY;
    if (expectedKey && req.headers["x-api-key"] !== expectedKey) {
      return res.status(401).json({ error: "Chave da API de conversão inválida." });
    }

    const { filename, docxBase64 } = req.body || {};
    if (!docxBase64) {
      return res.status(400).json({ error: "Envie docxBase64 para converter." });
    }

    const docxBuffer = Buffer.from(String(docxBase64), "base64");
    const pdfBuffer = await convertDocxToPdfLocal(docxBuffer, filename || "contrato.docx");
    const pdfFilename = String(filename || "contrato.docx").replace(/\.docx$/i, ".pdf");

    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err: any) {
    console.error("Erro na API convert-docx-to-pdf:", err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- PDF do Contrato Parcelado (DOCX → LibreOffice → PDF) ---
app.post("/api/contrato/parcelado-padrao-pdf", isAuthenticated, async (req: any, res: any) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o PDF." });

    const docxBuffer = await gerarContratoParceladoPadrao({ vendedor, cliente, empreendimento, venda });

    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const docxFilename = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    const pdfFilename = docxFilename.replace(/\.docx$/i, ".pdf");

    const pdfBuffer = await convertDocxToPdfViaLibreOffice(Buffer.from(docxBuffer), docxFilename);

    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// --- PDF do Contrato À Vista (DOCX → LibreOffice → PDF) ---
app.post("/api/contrato/avista-padrao-pdf", isAuthenticated, async (req: any, res: any) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o PDF à vista." });

    const userRow = await localUsersService.findById((req as any).userId || req.user?.id || "");
    const corretor = { nome: userRow?.profile?.nome, creci: userRow?.profile?.creci, telefone: userRow?.profile?.telefone };
    const docxBuffer = await gerarReciboAVistaPadrao({ corretor, vendedor, cliente, empreendimento, venda });

    const nomeCliente = (cliente.nome as string).replace(/\s+/g, "_");
    const nomeEmp = (empreendimento.nome as string).replace(/\s+/g, "_").toUpperCase();
    const docxFilename = `contrato_avista_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${(venda as any).numeroLote}_-_Quadra__${(venda as any).quadra}_.docx`;
    const pdfFilename = docxFilename.replace(/\.docx$/i, ".pdf");

    const pdfBuffer = await convertDocxToPdfViaLibreOffice(Buffer.from(docxBuffer), docxFilename);

    res.setHeader("Content-Disposition", `attachment; filename="${pdfFilename}"`);
    res.setHeader("Content-Type", "application/pdf");
    res.send(pdfBuffer);
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// Resolver link encurtado do Google Maps e extrair coordenadas
app.post("/api/resolve-maps-url", isAuthenticated, async (req: any, res: any) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: "URL não fornecida." });

    // Tentar extrair coords direto da URL antes de fazer fetch
    const patterns = [
      /@(-?\d+\.\d+),(-?\d+\.\d+)/,
      /\?q=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
      /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
      new RegExp('place/[^/]+/@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)'),
    ];

    for (const pat of patterns) {
      const m = url.match(pat);
      if (m) return res.json({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: url });
    }

    // Link encurtado: seguir redirect com diferentes user agents
    const userAgents = [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36",
      "GoogleMapsLocator/1.0",
    ];

    let finalUrl = url;
    let html = "";

    for (const ua of userAgents) {
      try {
        const response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { "User-Agent": ua, "Accept-Language": "pt-BR,pt;q=0.9" },
          signal: AbortSignal.timeout(8000),
        });
        finalUrl = response.url;
        html = await response.text().catch(() => "");

        // Tentar na URL final primeiro
        for (const pat of patterns) {
          const m = finalUrl.match(pat);
          if (m) return res.json({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl });
        }

        // Tentar no HTML
        const htmlPatterns = [
          /@(-?\d+\.\d+),(-?\d+\.\d+)/,
          /center=(-?\d+\.\d+),(-?\d+\.\d+)/,
          /"lat":(-?\d+\.\d+),"lng":(-?\d+\.\d+)/,
          /\["",(-?\d+\.\d+),(-?\d+\.\d+)\]/,
          /ll=(-?\d+\.\d+),(-?\d+\.\d+)/,
          new RegExp('place/[^@]+@(-?\\d+\\.\\d+),(-?\\d+\\.\\d+)'),
        ];
        for (const pat of htmlPatterns) {
          const m = html.match(pat);
          if (m && Math.abs(parseFloat(m[1])) <= 90 && Math.abs(parseFloat(m[2])) <= 180) {
            return res.json({ lat: parseFloat(m[1]), lng: parseFloat(m[2]), resolvedUrl: finalUrl });
          }
        }

        if (finalUrl !== url) break; // Conseguiu redirecionar, parar de tentar
      } catch {}
    }

    return res.json({ resolvedUrl: finalUrl, lat: null, lng: null, hint: "Link encurtado não pôde ser resolvido. Cole as coordenadas diretamente." });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default app;
