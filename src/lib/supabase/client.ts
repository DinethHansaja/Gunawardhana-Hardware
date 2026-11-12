import { createBrowserClient } from "@supabase/ssr";
import { getSupabasePublicConfig } from "./config";

export function createClient() {
  const config = getSupabasePublicConfig();
  if (!config) throw new Error("Supabase URL and publishable key are required.");
  return createBrowserClient(config.url, config.key);
}
