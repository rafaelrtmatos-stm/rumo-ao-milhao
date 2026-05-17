var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// api/index.ts
import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import pg2 from "pg";
import { eq as eq2, and } from "drizzle-orm";
import jwt from "jsonwebtoken";

// server/db.ts
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

// shared/schema.ts
var schema_exports = {};
__export(schema_exports, {
  appConfig: () => appConfig,
  clientes: () => clientes,
  empreendimentos: () => empreendimentos,
  localUsers: () => localUsers,
  vendas: () => vendas
});
import { pgTable, text, jsonb, timestamp, boolean } from "drizzle-orm/pg-core";
var localUsers = pgTable("local_users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isAdmin: boolean("is_admin").notNull().default(false),
  permissions: jsonb("permissions").$type().default({}),
  profile: jsonb("profile").$type().default({}),
  createdAt: timestamp("created_at").defaultNow()
});
var empreendimentos = pgTable("empreendimentos", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var clientes = pgTable("clientes", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var vendas = pgTable("vendas", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow()
});
var appConfig = pgTable("app_config", {
  userId: text("user_id").primaryKey(),
  data: jsonb("data").notNull().default({ theme: "standard" }),
  createdAt: timestamp("created_at").defaultNow()
});

// server/db.ts
var { Pool } = pg;
var pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 4e3,
  idleTimeoutMillis: 1e4
});
var db = drizzle(pool, { schema: schema_exports });

// server/contratoParceladoPadrao.ts
import AdmZip from "adm-zip";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
function inteiroExtenso(n) {
  if (n === 0) return "zero";
  const unidades = [
    "",
    "um",
    "dois",
    "tr\xEAs",
    "quatro",
    "cinco",
    "seis",
    "sete",
    "oito",
    "nove",
    "dez",
    "onze",
    "doze",
    "treze",
    "quatorze",
    "quinze",
    "dezesseis",
    "dezessete",
    "dezoito",
    "dezenove"
  ];
  const dezenas = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
  const centenas = ["", "cento", "duzentos", "trezentos", "quatrocentos", "quinhentos", "seiscentos", "setecentos", "oitocentos", "novecentos"];
  if (n === 100) return "cem";
  if (n === 1e3) return "mil";
  if (n < 20) return unidades[n];
  if (n < 100) {
    const dez = Math.floor(n / 10);
    const un = n % 10;
    return dezenas[dez] + (un > 0 ? " e " + unidades[un] : "");
  }
  if (n < 1e3) {
    const cent = Math.floor(n / 100);
    const rest2 = n % 100;
    return centenas[cent] + (rest2 > 0 ? " e " + inteiroExtenso(rest2) : "");
  }
  if (n < 1e6) {
    const mil = Math.floor(n / 1e3);
    const rest2 = n % 1e3;
    const milText = mil === 1 ? "mil" : inteiroExtenso(mil) + " mil";
    if (rest2 === 0) return milText;
    const useE = rest2 < 100 || rest2 % 100 === 0;
    return milText + (useE ? " e " : " ") + inteiroExtenso(rest2);
  }
  const mi = Math.floor(n / 1e6);
  const rest = n % 1e6;
  const miText = mi === 1 ? "um milh\xE3o" : inteiroExtenso(mi) + " milh\xF5es";
  if (rest === 0) return miText;
  return miText + " e " + inteiroExtenso(rest);
}
function capitalizar(s) {
  if (!s) return "";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function valorExtenso(n) {
  const intPart = Math.floor(n);
  const cents = Math.round((n - intPart) * 100);
  const intText = inteiroExtenso(intPart);
  const label = intPart === 1 ? "Real" : "Reais";
  if (cents === 0) return intText + " " + label;
  return intText + " " + label + " e " + inteiroExtenso(cents) + (cents === 1 ? " centavo" : " centavos");
}
function brlNum(n) {
  const safe = n == null || isNaN(Number(n)) ? 0 : Number(n);
  return safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function numExt(n) {
  const safe = n == null || isNaN(Number(n)) ? 0 : Number(n);
  return `${brlNum(safe)} (${capitalizar(valorExtenso(safe))})`;
}
function dataExtenso(date) {
  const meses = [
    "Janeiro",
    "Fevereiro",
    "Mar\xE7o",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro"
  ];
  return `${date.getDate()} de ${meses[date.getMonth()]} de ${date.getFullYear()}`;
}
function primeiraParcela(dateStr) {
  if (!dateStr) return "___/___/______";
  const d = /* @__PURE__ */ new Date(dateStr + "T12:00:00");
  d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("pt-BR");
}
function diaDoMes(dateStr) {
  if (!dateStr) return 1;
  return (/* @__PURE__ */ new Date(dateStr + "T12:00:00")).getDate();
}
function xmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function rep(xml, search, replacement) {
  if (!search) return xml;
  const safe = xmlEscape(replacement);
  const chars = [...search].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = chars.join("(?:<[^>]*>\\s*)*");
  try {
    return xml.replace(new RegExp(pattern, "g"), safe);
  } catch {
    return xml.split(search).join(safe);
  }
}
var T = {
  // Vendedor
  VEND_NOME: "GENILSON PEREIRA MOREIRA",
  VEND_NAC: "brasileiro",
  VEND_CIVIL: "solteiro",
  VEND_RG: "3215776",
  VEND_CPF: "632.939.002-91",
  // Endereço vendedor - contexto completo para evitar matches errados
  VEND_ADDR: "Travessa Maranh\xE3o, n\xB0 353, Aeroporto Velho, Santar\xE9m, PA, CEP 68020-070",
  // Comprador
  COMP_INTRO: "a Sra. ",
  COMP_NOME: "MONIQUE DE NAZARE CASTRO VALENTE",
  COMP_NAC: "brasileira",
  COMP_CIVIL: "solteira",
  COMP_RG: "4478817 PC PA",
  COMP_CPF: "747.909.512-00",
  COMP_FONES: "(91) 98294-8762 (91) 98888-6169",
  // Endereço comprador - contexto completo
  COMP_ADDR: "Rua Oliveira Belo, n\xB0 10, Umarizal, Bel\xE9m, PA, CEP 66050-380",
  // Imóvel
  EMP_NOME: "DEUS DA PAZ",
  EMP_COM: "Caranazal",
  EMP_SLASH: "Santar\xE9m/PA",
  // formato "Cidade/UF" no corpo
  LOTE_QUADRA: "Lote 35 da Quadra (C)",
  RUA: "Rua Existente",
  DIM: "10,54 metros de frente, lateral direita medindo 42,07 metros, pela lateral esquerda medindo 45,39 e medindo 10,00 metros de fundos, com \xE1rea total de 437,31 metros quadrados",
  // Financeiro (número + extenso sem "R$ " — o "R$" está em run separado)
  VALOR_NUM: "38.800,00 (Trinta e oito mil e oitocentos Reais)",
  ENT_NUM: "1.000,00 (Mil Reais)",
  SALDO_NUM: "37.800,00 (Trinta e sete mil e oitocentos Reais)",
  PARC_CTX: "63 (Sessenta e tr\xEAs)",
  // contexto p/ evitar match em outros nºs
  VALPAR_NUM: "600,00 (Seiscentos Reais)",
  DIA_CTX: "vencimento no dia 20 de cada m\xEAs",
  PRIMEIRA: "20/06/2026",
  CORR_NUM: "3.104,00 (Tr\xEAs mil cento e quatro Reais)",
  // Fórum / data
  FORUM: "Santar\xE9m-PA",
  DATA: "12 de Maio de 2026"
};
function buildCorretorXml(corretor) {
  if (!corretor?.nome?.trim()) return "";
  const xmlEscapeLocal = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rPr = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const rPrB = `<w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman"/><w:b/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
  const center = `<w:pPr><w:jc w:val="center"/></w:pPr>`;
  const p = (rpr, text2) => `<w:p>${center}<w:r>${rpr}<w:t xml:space="preserve">${xmlEscapeLocal(text2)}</w:t></w:r></w:p>`;
  let xml = `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="400"/></w:pPr></w:p>`;
  xml += p(rPr, "________________________________________");
  xml += p(rPrB, corretor.nome.toUpperCase());
  if (corretor.creci?.trim()) xml += p(rPr, `CRECI: ${corretor.creci.trim()}`);
  if (corretor.telefone?.trim()) xml += p(rPr, `Tel: ${corretor.telefone.trim()}`);
  return xml;
}
async function gerarContratoParceladoPadrao(params) {
  const { vendedor, cliente, empreendimento, venda } = params;
  const vendaSegura = {
    ...venda,
    valorLote: Number(venda.valorLote) || 0,
    valorEntrada: Number(venda.valorEntrada) || 0,
    quantidadeParcelas: Number(venda.quantidadeParcelas) || 0,
    valorParcela: Number(venda.valorParcela) || 0
  };
  const templatePath = path.join(__dirname, "..", "attached_assets", "contrato_template.docx");
  const zip = new AdmZip(templatePath);
  let xml = zip.readAsText("word/document.xml");
  const isF = cliente.genero === "F";
  const compLabel = isF ? "COMPRADORA" : "COMPRADOR";
  const saldo = vendaSegura.valorLote - vendaSegura.valorEntrada;
  const corretagem = vendaSegura.valorLote * 0.08;
  const dataVenda = /* @__PURE__ */ new Date((vendaSegura.dataVenda || (/* @__PURE__ */ new Date()).toISOString()).split("T")[0] + "T12:00:00");
  const forumCidade = `${empreendimento.cidade || "Santar\xE9m"}-${empreendimento.estado || "PA"}`;
  const empSlash = `${empreendimento.cidade || "Santar\xE9m"}/${empreendimento.estado || "PA"}`;
  const phones = [cliente.telefone1, cliente.telefone2].filter(Boolean).join(" ");
  const dimStr = vendaSegura.medidaFrente ? `${vendaSegura.medidaFrente} metros de frente, lateral direita medindo ${vendaSegura.medidaLateralDir || "___"} metros, pela lateral esquerda medindo ${vendaSegura.medidaLateralEsq || "___"} e medindo ${vendaSegura.medidaFundos || "___"} metros de fundos, com \xE1rea total de ${vendaSegura.areaTotal || "___"} metros quadrados` : `___ metros de frente, lateral direita medindo ___ metros, pela lateral esquerda medindo ___ e medindo ___ metros de fundos, com \xE1rea total de ___ metros quadrados`;
  const parcelasExt = capitalizar(inteiroExtenso(vendaSegura.quantidadeParcelas));
  const diaVenc = String(diaDoMes(vendaSegura.dataVencimento));
  const primeiraPag = primeiraParcela(vendaSegura.dataVencimento);
  xml = rep(xml, T.VEND_NOME, vendedor.nome.toUpperCase());
  xml = rep(xml, T.VEND_NAC, vendedor.nacionalidade.toLowerCase());
  xml = rep(xml, T.VEND_CIVIL, vendedor.estadoCivil.toLowerCase());
  xml = rep(xml, T.VEND_RG, vendedor.rg);
  xml = rep(xml, T.VEND_CPF, vendedor.cpf);
  const vendAddr = `${vendedor.endereco}, n\xB0 ${vendedor.numero}, ${vendedor.bairro}, ${vendedor.cidade}, ${vendedor.estado}, CEP ${vendedor.cep}`;
  xml = rep(xml, T.VEND_ADDR, vendAddr);
  xml = rep(xml, T.COMP_INTRO, isF ? "a Sra. " : "o Sr. ");
  xml = rep(xml, T.COMP_NOME, cliente.nome.toUpperCase());
  xml = rep(xml, T.COMP_NAC, (cliente.nacionalidade || (isF ? "brasileira" : "brasileiro")).toLowerCase());
  xml = rep(xml, T.COMP_CIVIL, cliente.estadoCivil.toLowerCase());
  xml = rep(xml, T.COMP_RG, cliente.rg);
  xml = rep(xml, T.COMP_CPF, cliente.cpf);
  if (phones) {
    xml = rep(xml, T.COMP_FONES, phones);
  } else {
    xml = rep(xml, `Telefone ${T.COMP_FONES}, `, "");
  }
  const compAddr = `${cliente.endereco}, n\xB0 ${cliente.numero}, ${cliente.bairro}, ${cliente.cidade}, ${cliente.estado}, CEP ${cliente.cep}`;
  xml = rep(xml, T.COMP_ADDR, compAddr);
  if (!isF) {
    xml = rep(xml, "portadora da", "portador da");
    xml = rep(xml, "residente e domiciliada", "residente e domiciliado");
    xml = rep(xml, "chamada simplesmente de", "chamado simplesmente de");
  }
  if (!isF) {
    xml = rep(xml, "da COMPRADORA", "do COMPRADOR");
    xml = rep(xml, "pela COMPRADORA", "pelo COMPRADOR");
    xml = rep(xml, "pel a COMPRADORA", "pelo COMPRADOR");
    xml = rep(xml, "A COMPRADORA", "O COMPRADOR");
    xml = rep(xml, "a COMPRADORA", "o COMPRADOR");
    xml = rep(xml, "COMPRADORA", "COMPRADOR");
  }
  xml = rep(xml, T.EMP_NOME, empreendimento.nome.toUpperCase());
  if (empreendimento.comunidade) {
    xml = rep(xml, T.EMP_COM, empreendimento.comunidade);
  }
  xml = rep(xml, T.EMP_SLASH, empSlash);
  xml = rep(xml, T.LOTE_QUADRA, `Lote ${vendaSegura.numeroLote} da Quadra (${vendaSegura.quadra})`);
  if (vendaSegura.rua) {
    xml = rep(xml, T.RUA, vendaSegura.rua);
  }
  xml = rep(xml, T.DIM, dimStr);
  xml = rep(xml, T.VALOR_NUM, numExt(vendaSegura.valorLote));
  xml = rep(xml, T.ENT_NUM, numExt(vendaSegura.valorEntrada));
  xml = rep(xml, T.SALDO_NUM, numExt(saldo));
  xml = rep(xml, T.PARC_CTX, `${vendaSegura.quantidadeParcelas} (${parcelasExt})`);
  xml = rep(xml, T.VALPAR_NUM, numExt(vendaSegura.valorParcela));
  xml = rep(xml, T.DIA_CTX, `vencimento no dia ${diaVenc} de cada m\xEAs`);
  xml = rep(xml, T.PRIMEIRA, primeiraPag);
  xml = rep(xml, T.CORR_NUM, numExt(corretagem));
  xml = rep(xml, T.FORUM, forumCidade);
  xml = rep(xml, T.DATA, dataExtenso(dataVenda));
  const corretorXml = buildCorretorXml(params.corretor ?? {});
  if (corretorXml) {
    xml = xml.replace("<w:sectPr", corretorXml + "<w:sectPr");
  }
  zip.updateFile("word/document.xml", Buffer.from(xml, "utf-8"));
  return zip.toBuffer();
}

// server/localUsersService.ts
import bcrypt from "bcryptjs";
import { eq, count as drizzleCount } from "drizzle-orm";
function toLocalUser(row) {
  return {
    id: row.id,
    email: row.email,
    password_hash: row.passwordHash,
    is_admin: row.isAdmin,
    permissions: row.permissions ?? {},
    profile: row.profile ?? {},
    created_at: row.createdAt
  };
}
var localUsersService = {
  async findByEmail(email) {
    const [row] = await db.select().from(localUsers).where(eq(localUsers.email, email.toLowerCase()));
    return row ? toLocalUser(row) : null;
  },
  async findById(id) {
    const [row] = await db.select().from(localUsers).where(eq(localUsers.id, id));
    return row ? toLocalUser(row) : null;
  },
  async listAll() {
    const rows = await db.select().from(localUsers).orderBy(localUsers.createdAt);
    return rows.map(toLocalUser);
  },
  async count() {
    const [result] = await db.select({ count: drizzleCount() }).from(localUsers);
    return Number(result?.count ?? 0);
  },
  async create(params) {
    const passwordHash = await bcrypt.hash(params.password, 10);
    const [row] = await db.insert(localUsers).values({
      id: params.id,
      email: params.email.toLowerCase(),
      passwordHash,
      isAdmin: params.isAdmin
    }).returning();
    return toLocalUser(row);
  },
  async deleteById(id) {
    await db.delete(localUsers).where(eq(localUsers.id, id));
  },
  async verifyPassword(user, password) {
    return bcrypt.compare(password, user.password_hash);
  },
  async updatePermissions(id, permissions) {
    await db.update(localUsers).set({ permissions }).where(eq(localUsers.id, id));
  },
  async updateProfile(id, profile) {
    await db.update(localUsers).set({ profile }).where(eq(localUsers.id, id));
  }
};

// api/index.ts
var app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.get("/api/debug", (_req, res) => {
  res.json({
    hasSupabaseUrl: !!process.env.VITE_SUPABASE_URL,
    hasSupabaseKey: !!process.env.VITE_SUPABASE_ANON_KEY,
    hasSession: !!process.env.SESSION_SECRET,
    hasDb: !!process.env.DATABASE_URL,
    node: process.version
  });
});
var PgSession = connectPgSimple(session);
var sessionTtl = 7 * 24 * 60 * 60 * 1e3;
var pgPool = new pg2.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("localhost") ? false : { rejectUnauthorized: false }
});
app.use(
  session({
    store: new PgSession({
      pool: pgPool,
      tableName: "session",
      createTableIfMissing: true
    }),
    secret: process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
      sameSite: "lax"
    }
  })
);
var GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
var GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`;
var AUTH_SECRET = process.env.SESSION_SECRET || "dev-secret-rumo-ao-milhao";
var isAuthenticated = (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (token) {
    try {
      const decoded = jwt.verify(token, AUTH_SECRET);
      if (decoded?.id) {
        req.tokenUser = {
          id: decoded.id,
          email: decoded.email,
          isAdmin: decoded.isAdmin
        };
        return next();
      }
    } catch {
    }
  }
  if (req.session?.localUser?.id) return next();
  return res.status(401).json({ message: "Unauthorized" });
};
function getRequestUser(req) {
  return req.session?.localUser || req.tokenUser;
}
function getUserId(req) {
  return getRequestUser(req)?.id;
}
var isAdminUser = async (req, res, next) => {
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
function safeParseJson(text2) {
  if (!text2) return {};
  try {
    return JSON.parse(text2);
  } catch {
    const match = text2.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1].trim());
      } catch {
      }
    }
    return {};
  }
}
app.get("/api/auth/setup", async (_req, res) => {
  try {
    const count = await localUsersService.count();
    res.json({ needsSetup: count === 0 });
  } catch (e) {
    res.status(500).json({ error: e?.message });
  }
});
app.post("/api/auth/setup", async (req, res) => {
  try {
    const count = await localUsersService.count();
    if (count > 0)
      return res.status(403).json({ error: "Setup j\xE1 realizado." });
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "E-mail e senha (m\xEDnimo 6 caracteres) s\xE3o obrigat\xF3rios." });
    await localUsersService.create({ id: `lu-admin-${Date.now()}`, email, password, isAdmin: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao criar administrador." });
  }
});
app.post("/api/auth/register", isAuthenticated, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password || password.length < 6)
      return res.status(400).json({ error: "E-mail e senha (m\xEDnimo 6 caracteres) s\xE3o obrigat\xF3rios." });
    const existing = await localUsersService.findByEmail(email);
    if (existing)
      return res.status(400).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
    const user = await localUsersService.create({ id: `lu-${Date.now()}`, email, password, isAdmin: false });
    res.json({ id: user.id, email: user.email });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao criar conta." });
  }
});
app.post("/api/auth/login", async (req, res) => {
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
    req.session.localUser = { id: user.id, email: user.email, isAdmin: user.is_admin };
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
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
      token
    });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao entrar." });
  }
});
app.post("/api/auth/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});
app.get("/api/auth/user", isAuthenticated, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const u = getRequestUser(req);
  try {
    const row = await localUsersService.findById(u.id);
    res.json({
      id: u.id,
      email: row?.email ?? u.email,
      isAdmin: row?.is_admin ?? false,
      permissions: row?.permissions ?? {},
      profile: row?.profile ?? {}
    });
  } catch {
    res.json({ id: u.id, email: u.email, isAdmin: false, permissions: {}, profile: {} });
  }
});
app.get("/api/auth/profile", isAuthenticated, async (req, res) => {
  const u = getRequestUser(req);
  try {
    const row = await localUsersService.findById(u.id);
    res.json({
      id: u.id,
      email: row?.email ?? u.email,
      isAdmin: row?.is_admin ?? false,
      permissions: row?.permissions ?? {},
      profile: row?.profile ?? {},
      ...row?.profile ?? {}
    });
  } catch {
    res.json({ id: u.id, email: u.email, isAdmin: false, permissions: {}, profile: {} });
  }
});
app.patch("/api/auth/profile", isAuthenticated, async (req, res) => {
  try {
    const u = getRequestUser(req);
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(u.id, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao atualizar perfil." });
  }
});
app.get("/api/admin/users", isAuthenticated, isAdminUser, async (_req, res) => {
  try {
    const rows = await localUsersService.listAll();
    res.json(rows.map((r) => ({ id: r.id, email: r.email, isAdmin: r.is_admin, createdAt: r.created_at, permissions: r.permissions ?? {}, profile: r.profile ?? {} })));
  } catch (e) {
    res.status(500).json({ error: "Erro ao buscar usu\xE1rios." });
  }
});
app.post("/api/admin/users", isAuthenticated, isAdminUser, async (req, res) => {
  try {
    const { email, password, isAdmin } = req.body;
    if (!email || !password || password.length < 6) {
      return res.status(400).json({ error: "E-mail e senha (m\xEDnimo 6 caracteres) s\xE3o obrigat\xF3rios." });
    }
    const existing = await localUsersService.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: "Este e-mail j\xE1 est\xE1 cadastrado." });
    }
    const newUser = await localUsersService.create({
      id: `lu-${Date.now()}`,
      email,
      password,
      isAdmin: isAdmin || false
    });
    res.json({ id: newUser.id, email: newUser.email, isAdmin: newUser.is_admin });
  } catch (e) {
    res.status(500).json({ error: "Erro ao criar usu\xE1rio." });
  }
});
app.delete("/api/admin/users/:id", isAuthenticated, isAdminUser, async (req, res) => {
  try {
    if (req.params.id === getUserId(req)) return res.status(400).json({ error: "Voc\xEA n\xE3o pode excluir sua pr\xF3pria conta." });
    await localUsersService.deleteById(req.params.id);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Erro ao excluir usu\xE1rio." });
  }
});
app.patch("/api/admin/users/:id/permissions", isAuthenticated, isAdminUser, async (req, res) => {
  try {
    const { permissions } = req.body;
    if (!permissions || typeof permissions !== "object") {
      return res.status(400).json({ error: "Permiss\xF5es inv\xE1lidas." });
    }
    await localUsersService.updatePermissions(req.params.id, permissions);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao salvar permiss\xF5es." });
  }
});
app.patch("/api/admin/users/:id/profile", isAuthenticated, isAdminUser, async (req, res) => {
  try {
    const { nome, creci, telefone } = req.body;
    await localUsersService.updateProfile(req.params.id, { nome, creci, telefone });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Erro ao salvar perfil." });
  }
});
var SHARED_USER = "shared";
app.get("/api/empreendimentos", isAuthenticated, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(empreendimentos).where(eq2(empreendimentos.userId, SHARED_USER));
    res.json(rows.map((r) => r.data));
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to fetch empreendimentos" });
  }
});
app.post("/api/empreendimentos", isAuthenticated, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items = req.body;
    const existing = await db.select({ id: empreendimentos.id }).from(empreendimentos).where(eq2(empreendimentos.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e) => e.id));
    const newIds = new Set(items.map((e) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(empreendimentos).where(and(eq2(empreendimentos.id, id), eq2(empreendimentos.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(empreendimentos).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to save empreendimentos" });
  }
});
app.get("/api/clientes", isAuthenticated, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(clientes).where(eq2(clientes.userId, SHARED_USER));
    res.json(rows.map((r) => r.data));
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to fetch clientes" });
  }
});
app.post("/api/clientes", isAuthenticated, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items = req.body;
    const existing = await db.select({ id: clientes.id }).from(clientes).where(eq2(clientes.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e) => e.id));
    const newIds = new Set(items.map((e) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(clientes).where(and(eq2(clientes.id, id), eq2(clientes.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(clientes).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: clientes.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to save clientes" });
  }
});
app.get("/api/vendas", isAuthenticated, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const rows = await db.select().from(vendas).where(eq2(vendas.userId, SHARED_USER));
    res.json(rows.map((r) => r.data));
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to fetch vendas" });
  }
});
app.post("/api/vendas", isAuthenticated, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const items = req.body;
    const existing = await db.select({ id: vendas.id }).from(vendas).where(eq2(vendas.userId, SHARED_USER));
    const existingIds = new Set(existing.map((e) => e.id));
    const newIds = new Set(items.map((e) => e.id));
    for (const id of existingIds)
      if (!newIds.has(id))
        await db.delete(vendas).where(and(eq2(vendas.id, id), eq2(vendas.userId, SHARED_USER)));
    for (const item of items)
      await db.insert(vendas).values({ id: item.id, userId: SHARED_USER, data: item }).onConflictDoUpdate({ target: vendas.id, set: { data: item } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to save vendas" });
  }
});
app.get("/api/config", isAuthenticated, async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const [row] = await db.select().from(appConfig).where(eq2(appConfig.userId, SHARED_USER));
    res.json(row ? row.data : { theme: "standard" });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to fetch config" });
  }
});
app.post("/api/config", isAuthenticated, async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    await db.insert(appConfig).values({ userId: SHARED_USER, data: req.body }).onConflictDoUpdate({ target: appConfig.userId, set: { data: req.body } });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e?.message || "Failed to save config" });
  }
});
app.post("/api/gemini/extract-sale", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: `Extraia os dados do texto abaixo e responda SOMENTE em JSON puro, sem markdown, sem explica\xE7\xF5es, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. IMPORTANTE: nascimento e dataVencimento devem estar no formato YYYY-MM-DD. Campos n\xE3o encontrados retorne "" ou null.

Texto:
${rawText}` }] }]
      })
    });
    const data = await response.json();
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err) {
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
        contents: [{ role: "user", parts: [{ text: `Extraia os dados do texto abaixo e retorne APENAS um JSON v\xE1lido, sem markdown, sem explica\xE7\xE3o.

Texto:
${rawText}

Retorne exatamente neste formato:
{"nome":"","nacionalidade":"","rg":"","cpf":"","estadoCivil":"","profissao":"","nascimento":"YYYY-MM-DD","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","lote":"","quadra":"","empreendimento":"","valorTotal":0,"entrada":0,"numeroParcelas":0,"valorParcela":0,"diaVencimento":""}` }] }]
      })
    });
    const data = await response.json();
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
app.post("/api/gemini/extract-files", isAuthenticated, async (req, res) => {
  try {
    const { files } = req.body;
    if (!files?.length)
      return res.status(400).json({ error: "Nenhum arquivo enviado" });
    const parts = files.map((f) => ({ inlineData: { mimeType: f.mimeType, data: f.base64 } }));
    parts.push({ text: `Extraia os dados dos documentos e responda SOMENTE em JSON puro, sem markdown, no formato: {"nomeComprador":"","cpf":"","rg":"","nascimento":"YYYY-MM-DD ou vazio","estadoCivil":"","profissao":"","nacionalidade":"","endereco":"","numero":"","bairro":"","cidade":"","estado":"","cep":"","telefone1":"","telefone2":"","numeroLote":"","quadra":"","valorLote":null,"valorEntrada":null,"quantidadeParcelas":null,"valorParcela":null,"dataVencimento":"YYYY-MM-DD ou vazio","vendedor":""}. Campos n\xE3o encontrados: "" ou null.` });
    const response = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }] })
    });
    const data = await response.json();
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err) {
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
          { text: `Analise este mapa de loteamento e extraia as informa\xE7\xF5es de lotes, quadras e ruas. Retorne APENAS JSON puro (sem markdown): {"lotes":[{"quadra":"A","lote":"01","rua":"Nome da Rua"}],"totalLotes":0,"ruasEncontradas":["Rua 1"]}` }
        ] }]
      })
    });
    const data = await response.json();
    res.json(safeParseJson(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}"));
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
app.post("/api/contrato/parcelado-padrao", isAuthenticated, async (req, res) => {
  try {
    const { vendedor, cliente, empreendimento, venda } = req.body;
    if (!vendedor || !cliente || !empreendimento || !venda)
      return res.status(400).json({ error: "Dados incompletos para gerar o contrato." });
    const buffer = await gerarContratoParceladoPadrao({ vendedor, cliente, empreendimento, venda });
    const nomeCliente = cliente.nome.replace(/\s+/g, "_");
    const nomeEmp = empreendimento.nome.replace(/\s+/g, "_").toUpperCase();
    const filename = `contrato_-_${nomeCliente}_-_${nomeEmp}_-_Lote_${venda.numeroLote}_-_Quadra__${venda.quadra}_.docx`;
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
var index_default = app;
var config = {
  api: {
    bodyParser: false
  }
};
export {
  config,
  index_default as default
};
