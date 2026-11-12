"use client";

import Link from "next/link";
import { useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const emailSchema = z.email("Enter a valid email address.");

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) { setError("Enter a valid email address."); return; }
    setBusy(true); setError(null); setMessage(null);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: `${window.location.origin}/auth/confirm`,
      });
      if (resetError) setError("Could not request a reset. Check your connection and try again.");
      else setMessage("If an account exists for that email, a reset link will arrive shortly.");
    } catch {
      setError("Password reset is unavailable until Supabase is configured.");
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
    <div><label htmlFor="reset-email" className="text-sm font-medium text-slate-700">Email address</label><input id="reset-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" /></div>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800">{message}</p>}
    <button disabled={busy} className="w-full rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{busy ? "Sending…" : "Send reset link"}</button>
    <Link href="/login" className="block text-center text-sm text-slate-600 underline underline-offset-4">Return to sign in</Link>
  </form>;
}
