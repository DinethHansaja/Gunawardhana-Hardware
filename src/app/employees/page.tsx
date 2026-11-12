import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { InviteForm } from "./invite-form";
import { SignOutButton } from "@/components/sign-out-button";
import { EmployeeRow } from "./employee-row";

export const dynamic = "force-dynamic";

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const employee = await requireEmployee(["admin"]);
  const supabase = await createClient();
  const [{ data: branches }, { data: profiles }, { data: assignments }, { data: branchAssignments }] = await Promise.all([
    supabase.from("branches").select("id, name").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, email, username, contact_email, display_name, phone, is_active").order("display_name"),
    supabase.from("user_roles").select("user_id, role_id"),
    supabase.from("user_branch_access").select("user_id, branch_id"),
  ]);
  const status = (await searchParams).status;
  const roleByUser = new Map((assignments ?? []).map((assignment) => [assignment.user_id, assignment.role_id]));
  const branchByUser = new Map((branchAssignments ?? []).map((assignment) => [assignment.user_id, assignment.branch_id]));
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Gunawardhana Hardware · User Management</p><SignOutButton /></div>
        <h1 className="mt-2 text-2xl font-semibold">User management</h1>
        <p className="mt-2 text-sm text-slate-600">Create username and password accounts, assign a role and branch, and manage access.</p>
        <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
          <h2 className="mb-5 text-sm font-semibold">Create user account</h2>
          <InviteForm branches={branches ?? []} />
        </section>
        {status === "updated" && <p role="status" className="mt-5 rounded-md bg-green-50 p-3 text-sm text-green-800">Employee access was updated.</p>}
        {status === "update_failed" && <p role="alert" className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-800">The employee change could not be applied. Check the details and try again.</p>}
        <section className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Users</h2><p className="mt-1 text-xs text-slate-500">Roles, account details, password resets, and access changes are administrator-only. Passwords are never displayed or stored by this app.</p></div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Manage account</th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {(profiles ?? []).map((profile) => {
                  const role = roleByUser.get(profile.id) ?? "";
                  const isSelf = profile.id === employee.id;
                  return <EmployeeRow key={profile.id} profile={profile} branches={branches ?? []} branchId={branchByUser.get(profile.id) ?? branches?.[0]?.id ?? ""} role={role as "admin" | "inventory_manager" | "cashier" | ""} isSelf={isSelf} />;
                })}
                {(!profiles || profiles.length === 0) && <tr><td colSpan={4} className="px-5 py-8 text-center text-sm text-slate-500">No user accounts found.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
