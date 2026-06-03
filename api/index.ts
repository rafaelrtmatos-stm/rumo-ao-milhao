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
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

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
app.get("/api/clientes/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [row] = await db.select().from(clientes)
      .where(and(eq(clientes.id, req.params.id), eq(clientes.userId, SHARED_USER)));
    if (!row) return res.status(404).json({ error: "Cliente não encontrado" });
    res.json(row.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to fetch cliente" });
  }
});

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
// ── ROTAS PÚBLICAS (SEM AUTH) — RESERVA DE CLIENTES ──

// Dados públicos do empreendimento
app.get('/api/publico/empreendimento/:id', async (req: any, res: any) => {
  try {
    const empId = req.params.id;
    // Buscar direto por ID (PK = ID do empreendimento)
    let empRows = await db.select().from(empreendimentos).where(eq(empreendimentos.id, empId));
    if (!empRows.length) {
      const all = await db.select().from(empreendimentos);
      const found = all.find((e: any) => e.data && (e.data as any).id === empId);
      if (found) empRows = [found];
    }
    if (!empRows.length) return res.status(404).json({ error: 'Empreendimento nao encontrado: ' + empId });
    const emp = empRows[0];
    // Dados do empreendimento ficam em emp.data (jsonb)
    const empData = (emp as any).data || {};
    const pontos: any[] = empData.mapaPontos || [];
    const lotesInfo: any = empData.lotesInfo || {};
    const allVendas = await db.select().from(vendas);
    const vendasEmp = allVendas.filter((v: any) => {
      const vData = v.data || v;
      return String(vData.empreendimentoId || v.empreendimentoId) === empId && vData.status !== 'cancelado';
    });
    const pontosPublicos = pontos.map((p: any) => {
      const venda = vendasEmp.find((v: any) => {
        const vd = v.data || v;
        return String(vd.quadra) === String(p.quadra) &&
          (String(vd.numeroLote) === String(p.lote) || String(vd.lote) === String(p.lote));
      });
      const vd = venda ? (venda.data || venda) : null;
      const infoKey = p.quadra + '-' + p.lote;
      const info = lotesInfo[infoKey] || {};
      return {
        id: p.id, quadra: p.quadra, lote: p.lote || p.numeroLote,
        xPercent: p.xPercent, yPercent: p.yPercent,
        status: vd ? (vd.status === 'rascunho' ? 'reservado' : 'vendido') : (p.status || 'disponivel'),
        preco: info.preco || 0,
        valorEntrada: info.entrada || 0,
        quantidadeParcelas: info.parcelas || 0,
        valorParcela: info.parcelas > 0 ? Math.round((info.preco - info.entrada) / info.parcelas) : 0,
      };
    });
    res.json({
      id: emp.id, nome: (emp as any).nome, cidade: (emp as any).cidade, estado: (emp as any).estado,
      mapaImagemUrl: empData.mapaImagemUrl || '',
      mapaImagemBase64: empData.mapaImagemLeveBase64 || empData.mapaImagemBase64 || '',
      totalLotes: (emp as any).totalLotes,
      pontos: pontosPublicos,
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// ── DIAGNÓSTICO PÚBLICO ─────────────────────────────────────────────────────
app.get('/api/publico/diagnostico/:id', async (req: any, res: any) => {
  try {
    const empId = req.params.id;
    const rows = await db.select().from(empreendimentos).where(eq(empreendimentos.id, empId));
    if (!rows.length) {
      const all = await db.select({ id: empreendimentos.id }).from(empreendimentos);
      return res.json({ encontrado: false, empId, idsNobanco: all.map((e:any) => e.id) });
    }
    const emp = rows[0];
    const d = (emp as any).data || {};
    return res.json({
      encontrado: true,
      empId,
      nome: d.nome,
      temMapaUrl: !!d.mapaImagemUrl,
      mapaUrl: d.mapaImagemUrl ? d.mapaImagemUrl.substring(0, 80) + '...' : null,
      temBase64: !!d.mapaImagemBase64,
      totalPontos: (d.mapaPontos || []).length,
    });
  } catch(e: any) { res.status(500).json({ error: e.message }); }
});

// ── PÁGINA DE EMBED DO MAPA ─────────────────────────────────────────────────
// Uso: <iframe src="https://rumoaomilhao.imb.br/mapa/ID_EMPREENDIMENTO" />
// Ou acesso direto: https://rumoaomilhao.imb.br/mapa/ID_EMPREENDIMENTO
app.get('/mapa/:id', async (req: any, res: any) => {
  try {
    const empId = req.params.id;
    // Buscar dados do empreendimento via rota pública
    // Buscar direto por ID — a PK do banco é o mesmo ID do empreendimento
    let empRows = await db.select().from(empreendimentos).where(eq(empreendimentos.id, empId));
    // Fallback: buscar pelo ID dentro do data JSON
    if (!empRows.length) {
      const all = await db.select().from(empreendimentos);
      const found = all.find((e: any) => e.data && (e.data as any).id === empId);
      if (found) empRows = [found];
    }
    if (!empRows.length) return res.status(404).send(`<h2 style="font-family:sans-serif;padding:40px">Empreendimento ${empId} não encontrado</h2>`);
    const emp = empRows[0];

    // Dados do empreendimento ficam em emp.data (jsonb)
    const empData2 = (emp as any).data || {};
    console.log('[Embed] empId:', empId, '| nome:', empData2.nome, '| mapaUrl:', empData2.mapaImagemUrl ? 'sim' : 'nao', '| pontos:', (empData2.mapaPontos||[]).length);
    const pontos: any[] = empData2.mapaPontos || [];
    const allVendasEmbed = await db.select().from(vendas);
    const vendasEmbed = allVendasEmbed.filter((v: any) => {
      const vd = (v.data || v) as any;
      return String(vd.empreendimentoId) === empId &&
        vd.status !== 'cancelado' && vd.status !== 'rascunho';
    });

    const pontosPublicos = pontos.map((p: any) => {
      const venda = vendasEmbed.find((v: any) => {
        const vd = (v.data || v) as any;
        return String(vd.quadra) === String(p.quadra) &&
          (String(vd.numeroLote) === String(p.lote));
      });
      // status do ponto: reservado se tiver venda rascunho no lotesInfo
      const lotKey = String(p.quadra) + '-' + String(p.lote);
      const lotInfo = (empData2.lotesInfo || {})[lotKey] || {};
      const status = venda ? 'vendido' : (lotInfo.status || p.status || 'disponivel');
      return { quadra: p.quadra, lote: p.lote, x: p.xPercent, y: p.yPercent, status };
    });

    // Usar URL do Supabase — Base64 é muito grande para HTML embed
    const mapaUrl = empData2.mapaImagemUrl || '';
    if (!mapaUrl) {
      return res.status(404).send('<h2 style="font-family:sans-serif;padding:40px;color:#ef4444">Mapa não encontrado. Configure a URL do mapa no painel.</h2>');
    }
    const nomeEmp = empData2.nome || (emp as any).nome || 'Empreendimento';
    const disponiveis = pontosPublicos.filter(p => p.status === 'disponivel').length;
    const total = pontosPublicos.length;
    const markerSizePct = Number(empData2.markerSizePercent || 100);
    const refWidth = Number(empData2.mapaMarkerReferenceWidth || 794);

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${nomeEmp} — Mapa de Lotes</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; background: #f8fafc; overflow: hidden; }
  #header { background: #1a4a1a; color: white; padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; }
  #header h1 { font-size: 15px; font-weight: 700; }
  #header .stats { font-size: 12px; opacity: 0.8; }
  #legenda { display: flex; gap: 12px; padding: 8px 16px; background: white; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
  .leg-item { display: flex; align-items: center; gap: 5px; font-size: 11px; color: #475569; font-weight: 600; }
  .leg-dot { width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 0 1px rgba(0,0,0,0.15); }
  #mapa-container { position: relative; width: 100%; overflow: hidden; touch-action: none; cursor: grab; }
  #mapa-container:active { cursor: grabbing; }
  #mapa-viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
  #mapa-img { display: block; width: 100%; user-select: none; pointer-events: none; }
  .bolinha { position: absolute; border-radius: 50%; border: 2px solid white; transform: translate(-50%, -50%); cursor: pointer; font-size: 0; box-shadow: 0 1px 4px rgba(0,0,0,0.3); transition: transform 0.1s; }
  .bolinha:hover { transform: translate(-50%, -50%) scale(1.3); z-index: 10; }
  .bolinha.disponivel { background: #2563eb; }
  .bolinha.reservado { background: #d97706; }
  .bolinha.vendido { background: #ef4444; }
  #tooltip { position: fixed; background: #0f172a; color: white; padding: 6px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; pointer-events: none; display: none; z-index: 9999; white-space: nowrap; }
  #rodape { position: fixed; bottom: 0; left: 0; right: 0; background: white; border-top: 1px solid #e2e8f0; padding: 6px 16px; font-size: 11px; color: #94a3b8; text-align: center; }
</style>
</head>
<body>
<div id="header">
  <h1>${nomeEmp}</h1>
  <span class="stats">${disponiveis} disponíveis de ${total} lotes</span>
</div>
<div id="legenda">
  <div class="leg-item"><div class="leg-dot" style="background:#2563eb"></div> Disponível</div>
  <div class="leg-item"><div class="leg-dot" style="background:#d97706"></div> Reservado</div>
  <div class="leg-item"><div class="leg-dot" style="background:#ef4444"></div> Vendido</div>
</div>
<div id="mapa-container">
  <div id="mapa-viewport" style="position:absolute;top:0;left:0;transform-origin:0 0;">
    <img id="mapa-img" src="${mapaUrl}" alt="Mapa de lotes" style="display:block;user-select:none;pointer-events:none;" onerror="this.parentElement.innerHTML='<p style=padding:40px;color:#ef4444;font-weight:bold>Erro ao carregar mapa. URL: ${mapaUrl ? mapaUrl.substring(0,50)+"..." : "não encontrada"}</p>'"/>
    <div id="pontos" style="position:absolute;top:0;left:0;width:100%;height:100%;"></div>
  </div>
</div>
<div id="tooltip"></div>
<div id="rodape">rumoaomilhao.imb.br — Toque em um lote disponível para reservar</div>

<!-- Modal de reserva -->
<div id="modal-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:9999;align-items:center;justify-content:center;padding:16px;">
  <div style="background:white;border-radius:16px;width:100%;max-width:400px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
    <div id="modal-header" style="background:#1a4a1a;color:white;padding:16px 20px;">
      <h3 id="modal-titulo" style="margin:0;font-size:16px;font-weight:700;">Reservar Lote</h3>
      <p id="modal-subtitulo" style="margin:4px 0 0;font-size:12px;opacity:0.7;"></p>
    </div>
    <div id="modal-body" style="padding:20px;">
      <div id="form-reserva">
        <div style="margin-bottom:14px;">
          <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Nome completo *</label>
          <input id="input-nome" type="text" placeholder="Seu nome completo"
            style="width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;"/>
        </div>
        <div style="margin-bottom:20px;">
          <label style="display:block;font-size:12px;font-weight:700;color:#374151;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">WhatsApp *</label>
          <input id="input-telefone" type="tel" placeholder="(93) 99999-9999"
            style="width:100%;padding:10px 14px;border:1.5px solid #e5e7eb;border-radius:10px;font-size:14px;box-sizing:border-box;outline:none;"/>
        </div>
        <p id="erro-msg" style="color:#ef4444;font-size:12px;margin:0 0 12px;display:none;"></p>
        <div style="display:flex;gap:10px;">
          <button onclick="fecharModal()"
            style="flex:1;padding:12px;border:1.5px solid #e5e7eb;border-radius:10px;background:white;font-size:14px;font-weight:600;cursor:pointer;color:#6b7280;">
            Cancelar
          </button>
          <button id="btn-reservar" onclick="enviarReserva()"
            style="flex:2;padding:12px;background:#1a4a1a;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">
            Reservar lote
          </button>
        </div>
      </div>
      <div id="confirmacao" style="display:none;text-align:center;padding:10px 0;">
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <h3 style="color:#1a4a1a;margin:0 0 8px;font-size:18px;">Pré-reserva confirmada!</h3>
        <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Aguarde nosso contato para finalizar sua reserva.</p>
        <a id="btn-whatsapp" href="#" target="_blank"
          style="display:block;padding:12px;background:#25D366;color:white;border-radius:10px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:10px;">
          💬 Enviar confirmação pelo WhatsApp
        </a>
        <button onclick="fecharModal()"
          style="width:100%;padding:12px;background:#1a4a1a;color:white;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;">
          OK
        </button>
      </div>
    </div>
  </div>
</div>
<script>
const pontos = ${JSON.stringify(pontosPublicos)};
const MARKER_SIZE_PCT = ${markerSizePct};
const REF_WIDTH = ${refWidth};
const COR = { disponivel: '#2563eb', reservado: '#d97706', vendido: '#ef4444' };
const STATUS_LABEL = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido' };

const img = document.getElementById('mapa-img');
const container = document.getElementById('mapa-container');
const pontosDiv = document.getElementById('pontos');
const tooltip = document.getElementById('tooltip');

// Ajustar altura do container
function ajustarAltura() {
  const headerH = document.getElementById('header').offsetHeight;
  const legendaH = document.getElementById('legenda').offsetHeight;
  const rodapeH = 32;
  container.style.height = (window.innerHeight - headerH - legendaH - rodapeH) + 'px';
}
ajustarAltura();
window.addEventListener('resize', () => {
  ajustarAltura();
  if (img.complete) {
    viewport.style.width = img.offsetWidth + 'px';
    renderBolinhas();
  }
});

// Renderizar bolinhas
function renderBolinhas() {
  pontosDiv.innerHTML = '';
  const w = img.offsetWidth;
  // Mesmo cálculo do app: BASE_SIZE_A4=10, radius=(10/2)*(w/refWidth)*pct
  const pct = Math.max(40, Math.min(220, MARKER_SIZE_PCT)) / 100;
  const sz = Math.max(6, Math.round(10 * (w / REF_WIDTH) * pct));
  pontos.forEach(p => {
    const el = document.createElement('div');
    el.className = 'bolinha ' + p.status;
    el.style.left = p.x + '%';
    el.style.top = p.y + '%';
    el.style.width = sz + 'px';
    el.style.height = sz + 'px';
    el.style.background = COR[p.status] || '#2563eb';
    el.addEventListener('mouseenter', (e) => {
      tooltip.style.display = 'block';
      tooltip.innerHTML = 'Q' + p.quadra + ' · L' + p.lote + ' — ' + STATUS_LABEL[p.status];
    });
    el.addEventListener('mousemove', (e) => {
      tooltip.style.left = (e.clientX + 12) + 'px';
      tooltip.style.top = (e.clientY - 10) + 'px';
    });
    el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    el.addEventListener('click', () => {
      tooltip.style.display = 'none';
      if (p.status === 'disponivel') {
        abrirFormulario(p.quadra, p.lote, el);
      } else {
        mostrarInfo(p.quadra, p.lote, p.status);
      }
    });
    pontosDiv.appendChild(el);
  });
}

// onload já definido acima no bloco Pan & Zoom

// Pan & Zoom
const viewport = document.getElementById('mapa-viewport');
let zoom = 1, panX = 0, panY = 0;
let drag = null;

// Inicializar viewport com largura da imagem
img.onload = function() {
  viewport.style.width = img.offsetWidth + 'px';
  renderBolinhas();
};
if (img.complete) {
  viewport.style.width = img.offsetWidth + 'px';
}

function applyTransform() {
  viewport.style.transform = \`translate(\${panX}px,\${panY}px) scale(\${zoom})\`;
}

// Mouse pan
container.addEventListener('mousedown', e => { drag = { x: e.clientX - panX, y: e.clientY - panY }; });
window.addEventListener('mousemove', e => {
  if (!drag) return;
  panX = e.clientX - drag.x; panY = e.clientY - drag.y;
  applyTransform();
});
window.addEventListener('mouseup', () => { drag = null; });

// Scroll zoom
container.addEventListener('wheel', e => {
  e.preventDefault();
  const rect = container.getBoundingClientRect();
  const fx = e.clientX - rect.left, fy = e.clientY - rect.top;
  const delta = e.deltaY < 0 ? 0.15 : -0.15;
  const newZoom = Math.max(1, Math.min(8, zoom + delta));
  const ratio = newZoom / zoom;
  panX = fx - (fx - panX) * ratio;
  panY = fy - (fy - panY) * ratio;
  zoom = newZoom;
  applyTransform();
}, { passive: false });

// Touch pinch & pan
let touches = {};
container.addEventListener('touchstart', e => {
  [...e.changedTouches].forEach(t => touches[t.identifier] = { x: t.clientX, y: t.clientY });
  if (e.touches.length === 1) drag = { x: e.touches[0].clientX - panX, y: e.touches[0].clientY - panY };
});
container.addEventListener('touchmove', e => {
  e.preventDefault();
  if (e.touches.length === 2) {
    const t0 = e.touches[0], t1 = e.touches[1];
    const prev0 = touches[t0.identifier], prev1 = touches[t1.identifier];
    if (!prev0 || !prev1) return;
    const prevDist = Math.hypot(prev0.x - prev1.x, prev0.y - prev1.y);
    const newDist  = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
    if (prevDist < 1) return;
    const rect = container.getBoundingClientRect();
    const fx = (t0.clientX + t1.clientX) / 2 - rect.left;
    const fy = (t0.clientY + t1.clientY) / 2 - rect.top;
    const ratio = newDist / prevDist;
    const newZoom = Math.max(1, Math.min(8, zoom * ratio));
    const zRatio = newZoom / zoom;
    panX = fx - (fx - panX) * zRatio;
    panY = fy - (fy - panY) * zRatio;
    zoom = newZoom;
    [...e.changedTouches].forEach(t => touches[t.identifier] = { x: t.clientX, y: t.clientY });
    applyTransform();
  } else if (e.touches.length === 1 && drag) {
    panX = e.touches[0].clientX - drag.x;
    panY = e.touches[0].clientY - drag.y;
    applyTransform();
  }
}, { passive: false });
container.addEventListener('touchend', e => {
  [...e.changedTouches].forEach(t => delete touches[t.identifier]);
  if (e.touches.length === 0) drag = null;
});

// ── RESERVA ──
const EMP_ID = '${empId}';
const EMP_NOME = '${nomeEmp}';
const SEU_WHATSAPP = '5593992332012';
let loteAtual = null;

function abrirFormulario(quadra, lote, el) {
  loteAtual = { quadra, lote, el };
  document.getElementById('modal-titulo').textContent = 'Reservar Lote Q' + quadra + ' · L' + lote;
  document.getElementById('modal-subtitulo').textContent = EMP_NOME;
  document.getElementById('form-reserva').style.display = 'block';
  document.getElementById('confirmacao').style.display = 'none';
  document.getElementById('input-nome').value = '';
  document.getElementById('input-telefone').value = '';
  document.getElementById('erro-msg').style.display = 'none';
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => document.getElementById('input-nome').focus(), 100);
}

function mostrarInfo(quadra, lote, status) {
  const labels = { reservado: 'Reservado', vendido: 'Vendido' };
  alert('Quadra ' + quadra + ' · Lote ' + lote + '\n' + (labels[status] || status));
}

function fecharModal() {
  document.getElementById('modal-overlay').style.display = 'none';
  loteAtual = null;
}

document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) fecharModal();
});

async function enviarReserva() {
  const nome = document.getElementById('input-nome').value.trim();
  const tel = document.getElementById('input-telefone').value.trim();
  const erroEl = document.getElementById('erro-msg');
  if (!nome || !tel) {
    erroEl.textContent = 'Preencha nome e WhatsApp.';
    erroEl.style.display = 'block';
    return;
  }
  const btn = document.getElementById('btn-reservar');
  btn.textContent = 'Reservando...';
  btn.disabled = true;
  try {
    const resp = await fetch('/api/publico/reservar-lote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        empreendimentoId: EMP_ID,
        empreendimentoNome: EMP_NOME,
        quadra: loteAtual.quadra,
        lote: loteAtual.lote,
        clienteNome: nome,
        clienteTelefone: tel,
      })
    });
    const data = await resp.json();
    if (!resp.ok) {
      erroEl.textContent = data.error || 'Erro ao reservar. Tente novamente.';
      erroEl.style.display = 'block';
      btn.textContent = 'Reservar lote';
      btn.disabled = false;
      return;
    }
    // Sucesso — atualizar bolinha para amarelo
    loteAtual.el.style.background = '#d97706';
    loteAtual.el.className = loteAtual.el.className.replace('disponivel', 'reservado');
    // Atualizar pontos locais
    const p = pontos.find(x => String(x.quadra) === String(loteAtual.quadra) && String(x.lote) === String(loteAtual.lote));
    if (p) p.status = 'reservado';
    // Mostrar confirmação com link WhatsApp
    const msg = encodeURIComponent('Olá! Acabei de fazer uma pré-reserva.\nNome: ' + nome + '\nLote: Q' + loteAtual.quadra + ' L' + loteAtual.lote + '\nEmpreendimento: ' + EMP_NOME + '\nTelefone: ' + tel);
    document.getElementById('btn-whatsapp').href = 'https://wa.me/' + SEU_WHATSAPP + '?text=' + msg;
    document.getElementById('form-reserva').style.display = 'none';
    document.getElementById('confirmacao').style.display = 'block';
  } catch(e) {
    erroEl.textContent = 'Erro de conexão. Tente novamente.';
    erroEl.style.display = 'block';
    btn.textContent = 'Reservar lote';
    btn.disabled = false;
  }
}
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(html);
  } catch (e: any) {
    res.status(500).send('<h2>Erro: ' + e.message + '</h2>');
  }
});

// Pré-reserva pública — salva como rascunho
app.post('/api/publico/pre-reserva', async (req: any, res: any) => {
  try {
    const body = req.body;
    if (!body.empreendimentoId || !body.quadra || !body.numeroLote || !body.clienteNome)
      return res.status(400).json({ error: 'Dados obrigatórios ausentes' });
    const allClientes = await db.query.clientes.findMany();
    let clienteExist = body.clienteCpf ? allClientes.find((c: any) => c.cpf === body.clienteCpf) : null;
    let clienteId = clienteExist ? clienteExist.id : String(Date.now());
    if (!clienteExist) {
      await db.insert(schema.clientes).values({
        id: clienteId, nome: body.clienteNome, cpf: body.clienteCpf || '',
        telefone1: body.clienteTelefone || '', telefone2: body.clienteWhatsapp || '',
        dataNascimento: body.clienteDataNascimento || '', endereco: body.clienteEndereco || '',
        dataCadastro: new Date().toISOString(),
      } as any).onConflictDoNothing();
    }
    const vendaId = String(Date.now() + 1);
    await db.insert(schema.vendas).values({
      id: vendaId, clienteId, empreendimentoId: body.empreendimentoId,
      empreendimentoNome: body.empreendimentoNome || '', clienteNome: body.clienteNome,
      quadra: body.quadra, numeroLote: body.numeroLote,
      valorLote: body.valorLote || 0, valorEntrada: body.valorEntrada || 0,
      quantidadeParcelas: body.quantidadeParcelas || 0, valorParcela: body.valorParcela || 0,
      dataVencimento: '', dataVenda: new Date().toISOString().split('T')[0],
      status: 'rascunho', vendedor: '', origemReserva: 'site_publico',
      documentos: JSON.stringify(body.documentos || []),
      createdAt: new Date().toISOString(),
    } as any).onConflictDoNothing();
    console.log('[Pre-reserva] ' + body.clienteNome + ' Q' + body.quadra + 'L' + body.numeroLote);
    res.json({ ok: true, vendaId, clienteId });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});


// ── RESERVA SIMPLIFICADA DO EMBED PÚBLICO ────────────────────────────────────
app.post('/api/publico/reservar-lote', async (req: any, res: any) => {
  try {
    const { empreendimentoId, empreendimentoNome, quadra, lote, clienteNome, clienteTelefone } = req.body;
    if (!empreendimentoId || !quadra || !lote || !clienteNome || !clienteTelefone)
      return res.status(400).json({ error: 'Dados obrigatórios: empreendimentoId, quadra, lote, clienteNome, clienteTelefone' });

    // Verificar se lote já está reservado/vendido
    const todasVendas = await db.select().from(vendas);
    const jaReservado = todasVendas.some((v: any) => {
      const vd = v.data || v;
      return String(vd.empreendimentoId) === String(empreendimentoId) &&
        String(vd.quadra) === String(quadra) &&
        String(vd.numeroLote) === String(lote) &&
        vd.status !== 'cancelado';
    });
    if (jaReservado) return res.status(409).json({ error: 'Este lote já está reservado ou vendido.' });

    // Criar cliente
    const clienteId = 'CLI-' + Date.now();
    await db.insert(clientes).values({
      id: clienteId,
      userId: SHARED_USER,
      data: {
        id: clienteId,
        nome: clienteNome,
        telefone1: clienteTelefone,
        dataCadastro: new Date().toISOString(),
        origemReserva: 'embed_publico',
      }
    } as any).onConflictDoNothing();

    // Criar venda/reserva
    const vendaId = 'VND-' + (Date.now() + 1);
    await db.insert(vendas).values({
      id: vendaId,
      userId: SHARED_USER,
      data: {
        id: vendaId,
        clienteId,
        clienteNome,
        clienteTelefone,
        empreendimentoId,
        empreendimentoNome: empreendimentoNome || '',
        quadra: String(quadra),
        numeroLote: String(lote),
        valorLote: 0, valorEntrada: 0,
        quantidadeParcelas: 0, valorParcela: 0,
        dataVenda: new Date().toISOString().split('T')[0],
        status: 'rascunho',
        origemReserva: 'site_publico',
        contratoGerado: false,
        documentos: [],
        createdAt: new Date().toISOString(),
      }
    } as any).onConflictDoNothing();

    console.log('[Reserva Embed] ' + clienteNome + ' Q' + quadra + ' L' + lote + ' - ' + empreendimentoNome);
    res.json({ ok: true, vendaId, clienteId, mensagem: 'Pré-reserva confirmada!' });
  } catch (e: any) {
    console.error('[Reserva Embed] Erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Upload público de documento
app.post('/api/publico/upload-doc', async (req: any, res: any) => {
  try {
    const multer = (await import('multer')).default;
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }).single('arquivo');
    upload(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo' });
      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
      const nomeArq = req.body.nomeArquivo || req.file.originalname;
      const clienteNome = (req.body.clienteNome || 'cliente').replace(/[^a-zA-Z0-9]/g, '_');
      const path = 'clientes/publico/' + clienteNome + '/' + Date.now() + '_' + nomeArq;
      const { error } = await sb.storage.from('documentos').upload(path, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
      if (error) return res.status(500).json({ error: error.message });
      const { data: u } = sb.storage.from('documentos').getPublicUrl(path);
      res.json({ ok: true, url: u.publicUrl, nome: nomeArq });
    });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

// ── API EXTERNA DE VENDAS ──

// Chave API para acesso externo — definida na variável de ambiente VENDAS_API_KEY
const VENDAS_API_KEY = process.env.VENDAS_API_KEY || '';

// Middleware de autenticação por chave
const autenticarApiKey = (req: any, res: any, next: any) => {
  const key = req.headers['x-api-key'];
  if (!key || key !== VENDAS_API_KEY || !VENDAS_API_KEY) {
    return res.status(401).json({ error: 'Chave de API inválida ou não configurada.' });
  }
  next();
};

// GET /api/info — rota pública para ver IDs dos empreendimentos (sem autenticação)
app.get("/api/info", async (req: any, res: any) => {
  try {
    const devs = await db.query.empreendimentos.findMany({
      columns: { id: true, data: true }
    });
    const result = devs.map((d: any) => ({
      id: d.id,
      nome: d.data?.nome || d.data?.name || "(sem nome)",
      cidade: d.data?.cidade || "",
    }));
    res.json({ empreendimentos: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/external/empreendimentos — listar empreendimentos (para descobrir IDs)
app.get('/api/external/empreendimentos', autenticarApiKey, async (req: any, res: any) => {
  try {
    const devs = await db.query.empreendimentos.findMany({
      columns: { id: true, nome: true, cidade: true, estado: true }
    });
    res.json({ ok: true, empreendimentos: devs });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/external/vendas — registrar venda de lote externamente
app.post('/api/external/vendas', autenticarApiKey, async (req: any, res: any) => {
  try {
    const {
      empreendimentoId, quadra, lote,
      clienteNome, clienteCpf, clienteTelefone, clienteEmail,
      valorTotal, entrada, parcelas, valorParcela,
      vendedorNome, dataVenda, observacao
    } = req.body;

    if (!empreendimentoId || !quadra || !lote || !clienteNome) {
      return res.status(400).json({ error: 'Campos obrigatórios: empreendimentoId, quadra, lote, clienteNome' });
    }

    // Verificar se empreendimento existe
    const dev = await db.query.empreendimentos.findFirst({
      where: (t: any, { eq }: any) => eq(t.id, empreendimentoId)
    });
    if (!dev) return res.status(404).json({ error: 'Empreendimento não encontrado.' });

    // Criar venda no banco
    const vendaId = 'ext_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    const novaVenda = {
      id: vendaId,
      empreendimentoId,
      quadra: String(quadra),
      lote: String(lote),
      clienteNome: String(clienteNome),
      clienteCpf: clienteCpf ? String(clienteCpf) : '',
      clienteTelefone: clienteTelefone ? String(clienteTelefone) : '',
      clienteEmail: clienteEmail ? String(clienteEmail) : '',
      valorTotal: Number(valorTotal) || 0,
      valorEntrada: Number(entrada) || 0,
      numeroParcelas: Number(parcelas) || 0,
      valorParcela: Number(valorParcela) || 0,
      vendedorNome: vendedorNome ? String(vendedorNome) : 'API Externa',
      dataVenda: dataVenda || new Date().toISOString().split('T')[0],
      observacao: observacao ? String(observacao) : 'Venda registrada via API externa',
      status: 'ativo',
      criadoEm: new Date().toISOString(),
      atualizadoEm: new Date().toISOString(),
    };

    await db.insert(schema.vendas).values(novaVenda);

    console.log(`[API Externa] Venda registrada: ${vendaId} - ${clienteNome} - Q${quadra}L${lote}`);
    res.json({ ok: true, vendaId, mensagem: `Venda de Q${quadra} L${lote} para ${clienteNome} registrada com sucesso!` });
  } catch (e: any) {
    console.error('[API Externa] Erro ao registrar venda:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/external/vendas/:empreendimentoId — listar vendas de um empreendimento
app.get('/api/external/vendas/:empreendimentoId', autenticarApiKey, async (req: any, res: any) => {
  try {
    const { empreendimentoId } = req.params;
    const vendas = await db.query.vendas.findMany({
      where: (t: any, { eq }: any) => eq(t.empreendimentoId, empreendimentoId)
    });
    res.json({ ok: true, total: vendas.length, vendas });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── UPLOAD DE DOCUMENTOS DE CLIENTES ──
app.post('/api/external/upload-documento', autenticarApiKey, async (req: any, res: any) => {
  try {
    const multer = (await import('multer')).default;
    const storage = multer.memoryStorage();
    const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }).single('arquivo');
    
    upload(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: 'Erro no upload: ' + err.message });
      if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      
      const { clienteId, clienteNome, nomeArquivo } = req.body;
      if (!clienteId) return res.status(400).json({ error: 'clienteId obrigatório' });

      const { createClient } = await import('@supabase/supabase-js');
      const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);
      
      const ext = (nomeArquivo || req.file.originalname).split('.').pop();
      const path = `clientes/${clienteId}/${Date.now()}.${ext}`;
      
      const { error } = await sb.storage.from('documentos').upload(path, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
      if (error) return res.status(500).json({ error: error.message });
      
      const { data: urlData } = sb.storage.from('documentos').getPublicUrl(path);
      
      console.log(`[Upload Doc] Cliente: ${clienteNome || clienteId} — ${nomeArquivo || req.file.originalname}`);
      res.json({ ok: true, url: urlData.publicUrl, path, nome: nomeArquivo || req.file.originalname });
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── DETECÇÃO DE BOLINHAS VIA CLAUDE VISION ──
app.post("/api/detectar-bolinhas", async (req: any, res: any) => {
  try {
    const { imageBase64, bolinhas } = req.body;
    if (!imageBase64 || !bolinhas?.length) {
      return res.status(400).json({ error: "imageBase64 e bolinhas são obrigatórios" });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: "ANTHROPIC_API_KEY não configurada" });
    }

    // Montar prompt com posições das bolinhas
    const listaBolinhas = bolinhas.map((b: any, i: number) =>
      "Bolinha " + (i+1) + ": posicao x=" + b.xPercent + "%, y=" + b.yPercent + "%"
    ).join("\n");

    const prompt = [
      "Esta e uma planta de loteamento. Abaixo estao as posicoes (em % da imagem) de bolinhas coloridas que representam lotes.",
      "",
      "Para cada bolinha, identifique o numero do LOTE e a QUADRA escritos mais proximos dela na planta.",
      "",
      listaBolinhas,
      "",
      'Responda APENAS com JSON valido, sem texto extra:',
      '{"resultados": [{"index": 0, "quadra": "A", "lote": "1"}, ...]}',
      "",
      "Se nao conseguir identificar, use \"\" para quadra e lote.",
      "Analise cuidadosamente os numeros escritos proximos a cada bolinha."
    ].join("\n");

    const mediaType = imageBase64.startsWith('data:image/png') ? 'image/png' : 
                      imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[detectar-bolinhas] Claude error:', err);
      return res.status(500).json({ error: 'Erro na API Claude: ' + response.status });
    }

    const data = await response.json() as any;
    const txt = data.content?.[0]?.text || '';
    const jsonMatch = txt.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Resposta inválida do Claude' });

    const parsed = JSON.parse(jsonMatch[0]);
    res.json(parsed);
  } catch (e: any) {
    console.error('[detectar-bolinhas] erro:', e.message);
    res.status(500).json({ error: e.message });
  }
});

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
  if (!processRes.ok) {
    let errDetail = '';
    try { errDetail = JSON.stringify(await processRes.json()); } catch {}
    console.error('[ILovePDF] process error:', processRes.status, errDetail);
    throw new Error("ILovePDF process failed: " + processRes.status + ' ' + errDetail);
  }

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
