import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { setupAuth, isAuthenticated, registerAuthRoutes } from "./replit_integrations/auth/index.js";
import { GoogleGenAI } from "@google/genai";
import { db } from "./db.js";
import { empreendimentos, clientes, vendas, appConfig } from "../shared/schema.js";
import { eq, and } from "drizzle-orm";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));

await setupAuth(app);
registerAuthRoutes(app);

const ai = new GoogleGenAI({
  apiKey: process.env.AI_INTEGRATIONS_GEMINI_API_KEY,
  httpOptions: {
    apiVersion: "",
    baseUrl: process.env.AI_INTEGRATIONS_GEMINI_BASE_URL,
  },
});

function getUserId(req: any): string {
  return req.user?.claims?.sub;
}

// --- Empreendimentos ---
app.get("/api/empreendimentos", isAuthenticated, async (req: any, res) => {
  try {
    const userId = getUserId(req);
    const rows = await db.select().from(empreendimentos).where(eq(empreendimentos.userId, userId));
    res.json(rows.map((r: any) => r.data));
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
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
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to save config" });
  }
});

// --- Gemini AI Proxy ---
app.post("/api/gemini/analyze-map", isAuthenticated, async (req, res) => {
  try {
    const { base64Data, mimeType } = req.body;
    const prompt = `
      Analise este mapa de loteamento (imagem ou PDF).
      Extraia uma lista de lotes, quadras e suas respectivas ruas.
      Retorne APENAS um JSON no formato:
      {
        "lotes": [{"quadra": "A", "lote": "01", "rua": "Nome da Rua"}],
        "totalLotes": 0,
        "ruasEncontradas": ["Rua 1", "Rua 2"]
      }
    `;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }, { inlineData: { data: base64Data, mimeType } }] }],
      config: { responseMimeType: "application/json" },
    });
    res.json(JSON.parse(response.text || "{}"));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI analysis failed" });
  }
});

app.post("/api/gemini/extract-files", isAuthenticated, async (req, res) => {
  try {
    const { files } = req.body;
    const fileParts = files.map((f: any) => ({ inlineData: { data: f.base64, mimeType: f.mimeType } }));
    const prompt = `Você é um assistente de extração de dados imobiliários brasileiros.
Analise os documentos enviados e extraia todos os dados de cadastro.
Retorne SOMENTE JSON puro, sem markdown:
{"nome":null,"cpf":null,"rg":null,"nascimento":null,"estadoCivil":null,"profissao":null,"nacionalidade":null,"endereco":null,"numero":null,"bairro":null,"cidade":null,"estado":null,"cep":null,"telefone1":null,"numeroLote":null,"quadra":null,"empreendimentoNome":null,"valorLote":null,"valorEntrada":null,"valorParcela":null,"quantidadeParcelas":null,"dataVencimento":null,"vendedor":null}`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }, ...fileParts] }],
      config: { responseMimeType: "application/json" },
    });
    res.json(JSON.parse(response.text || "{}"));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI extraction failed" });
  }
});

app.post("/api/gemini/extract-sale", isAuthenticated, async (req, res) => {
  try {
    const { rawText } = req.body;
    const prompt = `Você é um assistente de extração de dados imobiliários brasileiros.
Extraia todos os dados do texto abaixo. Retorne SOMENTE JSON puro:
{"nomeComprador":null,"nacionalidade":null,"rg":null,"cpf":null,"estadoCivil":null,"profissao":null,"telefone1":null,"endereco":null,"numero":null,"bairro":null,"cidade":null,"estado":null,"cep":null,"numeroLote":null,"quadra":null,"empreendimentoNome":null,"valorLote":null,"valorEntrada":null,"valorParcela":null,"quantidadeParcelas":null,"dataVencimento":null,"vendedor":null}
Texto: """${rawText}"""`;
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });
    res.json(JSON.parse(response.text || "{}"));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "AI extraction failed" });
  }
});

// --- Dev: serve via Vite middleware; Prod: serve static build ---
if (process.env.NODE_ENV === "production") {
  const distPath = path.resolve(__dirname, "../dist/public");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });
} else {
  const { createServer: createViteServer } = await import("vite");
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
}

const PORT = parseInt(process.env.PORT || "5000");
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
