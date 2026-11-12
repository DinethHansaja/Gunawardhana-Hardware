"use server";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const loginSchema = z.object({
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/),
  password: z.string().min(1).max(128),
});

export type UsernameLoginResult = { error?: string };

export async function loginWithUsername(username: string, password: string): Promise<UsernameLoginResult> {
  const parsed = loginSchema.safeParse({ username, password });
  if (!parsed.success) return { error: "Sign-in failed. Check your username and password." };
  try {
    // The mapping stays server-side; callers never receive an account's Auth email.
    const admin = createAdminClient();
    const { data: profile } = await admin.from("profiles").select("email")
      .eq("username", parsed.data.username).eq("is_active", true).maybeSingle();
    const supabase = await createClient();
    // Unknown usernames still reach Auth so its per-IP/password rate limits apply.
    const loginEmail = profile?.email ?? `${parsed.data.username}@accounts.gunawardhana.invalid`;
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: parsed.data.password });
    if (error) return { error: "Sign-in failed. Check your username and password." };
    if (!profile?.email) {
      await supabase.auth.signOut();
      return { error: "Sign-in failed. Check your username and password." };
    }
  } catch {
    return { error: "Sign-in is temporarily unavailable. Try again shortly." };
  }
  redirect("/");
}
