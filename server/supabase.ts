import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://uftxcwcryqpkfdfxzlno.supabase.co";

const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SECRET_KEY ||
  (process.env.SESSION_SECRET && process.env.SESSION_SECRET.startsWith("sb_")
    ? process.env.SESSION_SECRET
    : null) ||
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
  const isSecret =
    supabaseKey?.startsWith("sb_secret_") ||
    !!process.env.SUPABASE_SERVICE_ROLE_KEY ||
    !!process.env.SUPABASE_SECRET_KEY;
  console.log(
    "[Supabase] Conectado com sucesso:",
    supabaseUrl,
    isSecret ? "(com chave de serviço/admin)" : "(com chave anon)"
  );
} else {
  console.warn("[Supabase] VITE_SUPABASE_URL ou Chave ausentes.");
}
