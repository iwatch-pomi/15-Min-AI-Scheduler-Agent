import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** サーバー専用の Supabase クライアント（service_role）。ブラウザから import しないこと */
export function db(): SupabaseClient {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です");
    client = createClient(url, key, { auth: { persistSession: false } });
  }
  return client;
}
