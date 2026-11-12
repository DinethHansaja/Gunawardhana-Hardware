"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { deleteEmployee, resetEmployeePassword, updateEmployeeDetails, updateEmployeeRole, updateEmployeeStatus } from "./actions";

type Branch = { id: string; name: string };
type EmployeeRowData = { id: string; username: string; email: string; contact_email: string | null; display_name: string; phone: string | null; is_active: boolean };
type Role = "admin" | "inventory_manager" | "cashier" | "";
const inputClass = "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

export function EmployeeRow({ profile, branches, branchId, role, isSelf }: { profile: EmployeeRowData; branches: Branch[]; branchId: string; role: Role; isSelf: boolean }) {
  const [result, setResult] = useState<{ error?: string; success?: string } | null>(null);
  const [pending, setPending] = useState(false);
  async function run(action: (form: FormData) => Promise<{ error?: string; success?: string }>, event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; setPending(true); setResult(null);
    try {
      const response = await action(new FormData(form));
      setResult(response);
      if (response.success) form.reset();
    } finally { setPending(false); }
  }
  const loginAlias = profile.email.endsWith("@accounts.gunawardhana.invalid");
  const isDeleted = profile.username.startsWith("deleted-");
  return <tr className="align-top">
    <td className="px-4 py-4"><p className="font-medium text-slate-800">{isDeleted ? "Deleted account" : `${profile.display_name}${isSelf ? " (you)" : ""}`}</p>{!isDeleted&&<><p className="mt-1 text-xs text-slate-500">@{profile.username}</p>{profile.contact_email && <p className="mt-1 text-xs text-slate-500">{profile.contact_email}</p>}{!profile.contact_email && loginAlias && <p className="mt-1 text-xs text-slate-400">Username sign-in</p>}</>}</td>
    <td className="px-4 py-4"><span className="text-slate-700">{role === "inventory_manager" ? "Inventory Staff" : role === "admin" ? "Administrator" : role === "cashier" ? "Cashier" : "Unassigned"}</span></td>
    <td className="px-4 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${profile.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{isDeleted?"Deleted":profile.is_active ? "Active" : "Disabled"}</span></td>
    <td className="min-w-[580px] space-y-3 px-4 py-4">
      {!isDeleted&&<details><summary className="cursor-pointer text-xs font-semibold text-slate-700">Edit user details</summary><form onSubmit={(e)=>run(updateEmployeeDetails,e)} className="mt-2 grid gap-2 rounded border border-slate-200 p-3 sm:grid-cols-2">
        <input type="hidden" name="userId" value={profile.id}/><label className="text-xs">Full name<input name="displayName" required minLength={2} maxLength={120} defaultValue={profile.display_name} className={`${inputClass} mt-1 w-full`}/></label>
        <label className="text-xs">Username<input name="username" required minLength={3} maxLength={32} pattern="[A-Za-z0-9][A-Za-z0-9._-]*" defaultValue={profile.username} autoCapitalize="none" className={`${inputClass} mt-1 w-full`}/></label>
        <label className="text-xs">Contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={profile.contact_email ?? ""} className={`${inputClass} mt-1 w-full`}/></label>
        <label className="text-xs">Phone<input name="phone" maxLength={40} defaultValue={profile.phone ?? ""} className={`${inputClass} mt-1 w-full`}/></label>
        <label className="text-xs">Branch<select name="branchId" required defaultValue={branchId} className={`${inputClass} mt-1 w-full`}>{branches.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>
        <label className="text-xs">Reason for change<input name="reason" required minLength={3} maxLength={500} placeholder="Reason" className={`${inputClass} mt-1 w-full`}/></label>
        <button disabled={pending} className="rounded bg-slate-800 px-3 py-2 text-xs font-medium text-white disabled:opacity-50 sm:col-span-2">Save details</button>
      </form></details>}
      {!isSelf && !isDeleted && <>
        <form action={updateEmployeeRole} className="flex flex-wrap items-center gap-2"><input type="hidden" name="userId" value={profile.id}/><select name="role" defaultValue={role} aria-label={`Role for ${profile.username}`} className={inputClass}><option value="admin">Administrator</option><option value="inventory_manager">Inventory Staff</option><option value="cashier">Cashier</option></select><input name="reason" required minLength={3} maxLength={500} placeholder="Role change reason" className={`${inputClass} w-40`}/><button className="rounded border border-slate-300 px-3 py-2 text-xs">Save role</button></form>
        <form action={updateEmployeeStatus} className="flex flex-wrap items-center gap-2"><input type="hidden" name="userId" value={profile.id}/><input type="hidden" name="isActive" value={profile.is_active?"false":"true"}/><input name="reason" required minLength={3} maxLength={500} placeholder="Status change reason" className={`${inputClass} w-40`}/><button className="rounded border border-slate-300 px-3 py-2 text-xs">{profile.is_active?"Deactivate":"Activate"}</button></form>
        {profile.is_active && <details><summary className="cursor-pointer text-xs font-semibold text-slate-700">Reset password</summary><form onSubmit={(e)=>run(resetEmployeePassword,e)} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="userId" value={profile.id}/><label className="text-xs">New password<input name="password" required type="password" minLength={12} maxLength={128} autoComplete="new-password" className={`${inputClass} mt-1 block w-44`}/></label><label className="text-xs">Reason<input name="reason" required minLength={3} maxLength={500} className={`${inputClass} mt-1 block w-36`}/></label><button disabled={pending} className="rounded border border-slate-300 px-3 py-2 text-xs disabled:opacity-50">Set password</button></form></details>}
        {profile.is_active && <details><summary className="cursor-pointer text-xs font-semibold text-red-700">Delete account</summary><form onSubmit={(e)=>{if(!window.confirm(`Remove ${profile.username} from sign-in access? Historical records will be retained.`)){e.preventDefault();return;} void run(deleteEmployee,e);}} className="mt-2 flex flex-wrap items-end gap-2"><input type="hidden" name="userId" value={profile.id}/><label className="text-xs">Reason<input name="reason" required minLength={3} maxLength={500} className={`${inputClass} mt-1 block w-48`}/></label><button disabled={pending} className="rounded border border-red-300 px-3 py-2 text-xs text-red-700 disabled:opacity-50">Delete account</button></form></details>}
      </>}
      {result?.error&&<p role="alert" className="rounded bg-red-50 p-2 text-xs text-red-800">{result.error}</p>}{result?.success&&<p role="status" className="rounded bg-green-50 p-2 text-xs text-green-800">{result.success}</p>}
      {isDeleted&&<p className="text-xs text-slate-500">Sign-in access has been removed. Historical records remain for audit.</p>}{isSelf&&<p className="text-xs text-slate-500">Your own role and status are protected. You can update your account details.</p>}
    </td>
  </tr>;
}
