// =============================================================================
// PATCH para api/index.ts
// Substitua o bloco "// Upsert individual de um empreendimento" pelos trechos abaixo
// =============================================================================

// ── REMOVER este bloco existente (~linha 710): ────────────────────────────────
//
// // Upsert individual de um empreendimento
// app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
//   res.setHeader("Cache-Control", "no-store");
//   try {
//     const item = req.body;
//     if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });
//     await db.insert(empreendimentos).values({ id: req.params.id, userId: SHARED_USER, data: item })
//       .onConflictDoUpdate({ target: empreendimentos.id, set: { data: item } });
//     res.json({ ok: true });
//   } catch (e: any) {
//     res.status(500).json({ error: e?.message || "Failed to upsert empreendimento" });
//   }
// });

// ── ADICIONAR em lugar do bloco acima: ───────────────────────────────────────

// Upsert individual de um empreendimento (SEM mapaImagemBase64 — vem via rota /mapa)
app.put("/api/empreendimentos/:id", isAuthenticated, async (req: any, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    const item = req.body;
    if (!item || !req.params.id) return res.status(400).json({ error: "Dados inválidos." });

    // Preserva mapaImagemBase64 existente no banco se o payload não trouxer
    // (o frontend envia a imagem via PUT /:id/mapa para evitar 413)
    let dataToSave = item;
    if (!item.mapaImagemBase64) {
      const [existing] = await db
        .select()
        .from(empreendimentos)
        .where(and(eq(empreendimentos.id, req.params.id), eq(empreendimentos.userId, SHARED_USER)));
      if (existing?.data) {
        const existingBase64 = (existing.data as any).mapaImagemBase64;
        if (existingBase64) {
          dataToSave = { ...item, mapaImagemBase64: existingBase64 };
        }
      }
    }

    await db.insert(empreendimentos)
      .values({ id: req.params.id, userId: SHARED_USER, data: dataToSave })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: dataToSave } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to upsert empreendimento" });
  }
});

// Upload separado da imagem do mapa (evita 413 no PUT principal)
// Chamado pelo frontend via PUT /api/empreendimentos/:id/mapa
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
    await db.insert(empreendimentos)
      .values({ id: req.params.id, userId: SHARED_USER, data: updatedData })
      .onConflictDoUpdate({ target: empreendimentos.id, set: { data: updatedData } });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to update mapa imagem" });
  }
});
