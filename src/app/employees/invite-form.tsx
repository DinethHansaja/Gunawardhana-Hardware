"use client";

import { useState } from "react";
import { createEmployee } from "./actions";

type Branch = { id: string; name: string };

export function InviteForm({ branches }: { branches: Branch[] }) {
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function submit(formData: FormData) {
    setPending(true); setMessage(null);
    try {
      const result = await createEmployee(formData);
      setMessage(result);
      if (result.success) (document.querySelector("#create-employee-form") as HTMLFormElement | null)?.reset();
    } finally { setPending(false); }
  }
  const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
  return <form id="create-employee-form" action={submit} className="grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium text-slate-700">Full name<input name="displayName" required minLength={2} maxLength={120} autoComplete="name" className={inputClass} /></label>
    <label className="text-sm font-medium text-slate-700">Username<input name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" autoCapitalize="none" autoComplete="off" className={inputClass} /></label>
    <label className="text-sm font-medium text-slate-700">Initial password<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" className={inputClass} /><span className="mt-1 block text-xs font-normal text-slate-500">At least 12 characters. Supabase Auth stores a bcrypt hash; this form does not save the password.</span></label>
    <label className="text-sm font-medium text-slate-700">Contact email <span className="font-normal text-slate-500">(optional)</span><input name="contactEmail" type="email" maxLength={254} autoComplete="email" className={inputClass} /></label>
    <label className="text-sm font-medium text-slate-700">Phone<input name="phone" maxLength={40} autoComplete="tel" className={inputClass} /></label>
    <label className="text-sm font-medium text-slate-700">Role<select name="role" required defaultValue="cashier" className={inputClass}><option value="cashier">Cashier</option><option value="inventory_manager">Inventory Staff</option><option value="admin">Administrator</option></select></label>
    <label className="text-sm font-medium text-slate-700 sm:col-span-2">Branch<select name="branchId" required className={inputClass}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
    {message?.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{message.error}</p>}
    {message?.success && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800 sm:col-span-2">{message.success}</p>}
    <button disabled={pending || branches.length === 0} className="rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:col-span-2">{pending ? "Creating account…" : "Create user account"}</button>
    {branches.length === 0 && <p className="text-xs text-amber-800 sm:col-span-2">No active branch is available for employee access.</p>}
  </form>;
}
