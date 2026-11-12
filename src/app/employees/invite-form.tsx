"use client";

import { useState } from "react";
import { inviteEmployee } from "./actions";

type Branch = { id: string; name: string };

export function InviteForm({ branches }: { branches: Branch[] }) {
  const [message, setMessage] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(formData: FormData) {
    setPending(true);
    setMessage(null);
    try {
      setMessage(await inviteEmployee(formData));
    } finally {
      setPending(false);
    }
  }

  const inputClass = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
  return (
    <form action={submit} className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Full name<input name="displayName" required minLength={2} maxLength={120} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Email<input name="email" required type="email" maxLength={254} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Phone<input name="phone" maxLength={40} className={inputClass} /></label>
      <label className="text-sm font-medium text-slate-700">Role<select name="role" required defaultValue="cashier" className={inputClass}><option value="admin">Admin</option><option value="inventory_manager">Inventory Manager</option><option value="cashier">Cashier</option></select></label>
      <label className="text-sm font-medium text-slate-700 sm:col-span-2">Branch<select name="branchId" required className={inputClass}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      {message?.error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800 sm:col-span-2">{message.error}</p>}
      {message?.success && <p role="status" className="rounded-md bg-green-50 p-3 text-sm text-green-800 sm:col-span-2">{message.success}</p>}
      <button disabled={pending || branches.length === 0} className="rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50 sm:col-span-2">{pending ? "Sending invitation…" : "Invite employee"}</button>
      {branches.length === 0 && <p className="text-xs text-amber-800 sm:col-span-2">No active branch is available for employee access.</p>}
    </form>
  );
}
