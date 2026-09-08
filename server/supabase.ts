import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://uftxcwcryqpkfdfxzlno.supabase.co";

const supabaseKey =
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY;

export const supabase: SupabaseClient | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })
    : null;

if (supabase) {
  console.log("[Supabase] Conectado com sucesso:", supabaseUrl);
} else {
  console.warn("[Supabase] VITE_SUPABASE_URL ou VITE_SUPABASE_ANON_KEY ausentes.");
}
