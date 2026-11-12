import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { SignOutButton } from "@/components/sign-out-button";
import { updateEmployeeRole, updateEmployeeStatus } from "./actions";

export const dynamic = "force-dynamic";

const roleLabels: Record<string, string> = {
  admin: "Admin",
  inventory_manager: "Inventory Manager",
  cashier: "Cashier",
};

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const employee = await requireEmployee(["admin"]);
  const supabase = await createClient();
  const [{ data: branches }, { data: profiles }, { data: assignments }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, email, display_name, phone, is_active").order("display_name"),
    supabase.from("user_roles").select("user_id, role_id"),
  ]);
  const status = (await searchParams).status;
  const roleByUser = new Map((assignments ?? []).map((assignment) => [assignment.user_id, assignment.role_id]));
  const inputClass = "rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Gunawardhana Hardware · Admin</p><SignOutButton /></div>
        <h1 className="mt-2 text-2xl font-semibold">Employee access</h1>
        <p className="mt-2 text-sm text-slate-600">Invite an employee and assign their role and branch. They set their password through Supabase Auth.</p>
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-5 text-sm font-semibold">New invitation</h2>
          <InviteForm branches={branches ?? []} />
        </section>
        {status === "updated" && <p role="status" className="mt-5 rounded-md bg-green-50 p-3 text-sm text-green-800">Employee access was updated.</p>}
        {status === "update_failed" && <p role="alert" className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-800">The employee change could not be applied. Check the details and try again.</p>}
        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Employees</h2><p className="mt-1 text-xs text-slate-500">Role changes and account status are audited.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Employee</th><th className="px-5 py-3">Role</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Access controls</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(profiles ?? []).map((profile) => {
                  const role = roleByUser.get(profile.id) ?? "";
                  const isSelf = profile.id === employee.id;
                  return <tr key={profile.id}>
                    <td className="px-5 py-4"><p className="font-medium text-slate-800">{profile.display_name}{isSelf ? " (you)" : ""}</p><p className="mt-1 text-xs text-slate-500">{profile.email}{profile.phone ? ` · ${profile.phone}` : ""}</p></td>
                    <td className="px-5 py-4 text-slate-700">{roleLabels[role] ?? "Unassigned"}</td>
                    <td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${profile.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{profile.is_active ? "Active" : "Disabled"}</span></td>
                    <td className="px-5 py-4">
                      {isSelf ? <span className="text-xs text-slate-500">Your own access is protected.</span> : <div className="flex items-center gap-2">
                        <form action={updateEmployeeRole} className="flex items-center gap-2">
                          <input type="hidden" name="userId" value={profile.id} />
                          <select name="role" defaultValue={role} aria-label={`Role for ${profile.display_name}`} className={inputClass}><option value="admin">Admin</option><option value="inventory_manager">Inventory Manager</option><option value="cashier">Cashier</option></select>
                          <input name="reason" required minLength={3} maxLength={500} placeholder="Reason" aria-label={`Role change reason for ${profile.display_name}`} className={`${inputClass} w-28`} />
                          <button className="rounded-md border border-slate-300 px-2.5 py-2 text-xs font-medium hover:bg-slate-50">Save role</button>
                        </form>
                        <form action={updateEmployeeStatus} className="flex items-center gap-1">
                          <input type="hidden" name="userId" value={profile.id} />
                          <input type="hidden" name="isActive" value={profile.is_active ? "false" : "true"} />
                          <input name="reason" required minLength={3} maxLength={500} placeholder="Reason" aria-label={`Status change reason for ${profile.display_name}`} className={`${inputClass} w-24`} />
                          <button className="rounded-md border border-slate-300 px-2.5 py-2 text-xs font-medium hover:bg-slate-50">{profile.is_active ? "Disable" : "Enable"}</button>
                        </form>
                      </div>}
                    </td>
                  </tr>;
                })}
                {(!profiles || profiles.length === 0) && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">No employee profiles found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
