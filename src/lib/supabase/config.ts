export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || /your-project|placeholder|your_key/i.test(`${url} ${key}`) || key.length < 20) return null;
  try {
    const parsed = new URL(url);
    const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    if (parsed.protocol !== "https:" && !isLocal) return null;
  } catch {
    return null;
  }
  return { url, key };
}

export function isSupabaseConfigured() {
  return getSupabasePublicConfig() !== null;
}
