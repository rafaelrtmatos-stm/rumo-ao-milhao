import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "";

let _client: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (!_client && SUPABASE_URL && SUPABASE_KEY) {
    _client = createClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return _client;
}

export function isSupabaseEnabled() {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

// Upsert a list of items into a Supabase table
async function upsertItems(table: string, userId: string, items: any[]) {
  const sb = getClient();
  if (!sb || items.length === 0) return;
  const rows = items.map((item) => ({ id: item.id, user_id: userId, data: item }));
  const { error } = await sb.from(table).upsert(rows, { onConflict: "id" });
  if (error) console.error(`[Supabase] upsert ${table}:`, error.message);
}

// Delete items from Supabase that no longer exist locally
async function deleteRemovedItems(table: string, userId: string, currentIds: string[]) {
  const sb = getClient();
  if (!sb) return;
  const { data, error } = await sb.from(table).select("id").eq("user_id", userId);
  if (error) { console.error(`[Supabase] fetch ids ${table}:`, error.message); return; }
  const remoteIds: string[] = (data || []).map((r: any) => r.id);
  const toDelete = remoteIds.filter((id) => !currentIds.includes(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await sb.from(table).delete().in("id", toDelete);
    if (delErr) console.error(`[Supabase] delete ${table}:`, delErr.message);
  }
}

// Fetch all items from Supabase for a user
async function fetchItems(table: string, userId: string): Promise<any[]> {
  const sb = getClient();
  if (!sb) return [];
  const { data, error } = await sb.from(table).select("data").eq("user_id", userId);
  if (error) { console.error(`[Supabase] fetch ${table}:`, error.message); return []; }
  return (data || []).map((r: any) => r.data);
}

// Upsert app_config (keyed by user_id, not id)
async function upsertConfig(userId: string, config: any) {
  const sb = getClient();
  if (!sb) return;
  const { error } = await sb
    .from("app_config")
    .upsert({ user_id: userId, data: config }, { onConflict: "user_id" });
  if (error) console.error("[Supabase] upsert app_config:", error.message);
}

async function fetchConfig(userId: string): Promise<any | null> {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb.from("app_config").select("data").eq("user_id", userId).maybeSingle();
  if (error) { console.error("[Supabase] fetch app_config:", error.message); return null; }
  return data?.data ?? null;
}

export const supabaseSync = {
  // Called after saving empreendimentos to local DB
  async syncEmpreendimentos(userId: string, items: any[]) {
    try {
      await upsertItems("empreendimentos", userId, items);
      await deleteRemovedItems("empreendimentos", userId, items.map((i) => i.id));
    } catch (e: any) {
      console.error("[Supabase] syncEmpreendimentos:", e?.message);
    }
  },

  // Called after saving clientes
  async syncClientes(userId: string, items: any[]) {
    try {
      await upsertItems("clientes", userId, items);
      await deleteRemovedItems("clientes", userId, items.map((i) => i.id));
    } catch (e: any) {
      console.error("[Supabase] syncClientes:", e?.message);
    }
  },

  // Called after saving vendas
  async syncVendas(userId: string, items: any[]) {
    try {
      await upsertItems("vendas", userId, items);
      await deleteRemovedItems("vendas", userId, items.map((i) => i.id));
    } catch (e: any) {
      console.error("[Supabase] syncVendas:", e?.message);
    }
  },

  // Called after saving config
  async syncConfig(userId: string, config: any) {
    try {
      await upsertConfig(userId, config);
    } catch (e: any) {
      console.error("[Supabase] syncConfig:", e?.message);
    }
  },

  // Pull all data for a user from Supabase (used for restore)
  async restoreAll(userId: string) {
    return {
      empreendimentos: await fetchItems("empreendimentos", userId),
      clientes: await fetchItems("clientes", userId),
      vendas: await fetchItems("vendas", userId),
      config: await fetchConfig(userId),
    };
  },
};
