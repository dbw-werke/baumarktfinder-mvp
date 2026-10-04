import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function configured() {
  if (!url || !publicKey) return false;
  try { return ["https:", "http:"].includes(new URL(url).protocol); } catch { return false; }
}

/** Missing configuration must not break static builds or the rest of the page. */
export const supabase = configured() ? createClient(url!, publicKey!, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
}) : null;

export const supabaseConfigured = supabase !== null;
