"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const passwordSchema = z.object({
  password: z.string().min(12, "Use at least 12 characters."),
  confirm: z.string(),
}).refine((value) => value.password === value.confirm, { path: ["confirm"], message: "Passwords do not match." });

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = passwordSchema.safeParse({ password, confirm });
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "Check the password fields."); return; }
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: parsed.data.password });
      if (updateError) { setError("The link may have expired. Request another password reset."); return; }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Password update is unavailable until Supabase is configured.");
    } finally { setBusy(false); }
  }

  const inputClass = "mt-1.5 block w-full rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
  return <form onSubmit={submit} className="mt-6 space-y-4 rounded-lg border border-slate-200 bg-white p-6">
    <div><label htmlFor="new-password" className="text-sm font-medium text-slate-700">New password</label><input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} className={inputClass} /></div>
    <div><label htmlFor="confirm-password" className="text-sm font-medium text-slate-700">Confirm password</label><input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className={inputClass} /></div>
    {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <button disabled={busy} className="w-full rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{busy ? "Saving…" : "Save password"}</button>
  </form>;
}
