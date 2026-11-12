import "server-only";

import { redirect } from "next/navigation";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export type EmployeeRole = "admin" | "inventory_manager" | "cashier";

export type Employee = {
  id: string;
  displayName: string;
  role: EmployeeRole;
};

const roleHome: Record<EmployeeRole, string> = {
  admin: "/dashboard",
  inventory_manager: "/inventory",
  cashier: "/pos",
};

export async function getEmployee(): Promise<Employee | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return null;

  const [{ data: profile, error: profileError }, { data: roleRows, error: rolesError }] = await Promise.all([
    supabase.from("profiles").select("display_name, is_active").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role_id").eq("user_id", user.id),
  ]);
  if (profileError || rolesError || !profile?.is_active || !roleRows?.length) return null;

  const priority: EmployeeRole[] = ["admin", "inventory_manager", "cashier"];
  const role = priority.find((candidate) => roleRows.some((row) => row.role_id === candidate));
  return role ? { id: user.id, displayName: profile.display_name, role } : null;
}

export async function requireEmployee(allowed: EmployeeRole[]) {
  const employee = await getEmployee();
  if (!employee) redirect("/login");
  if (!allowed.includes(employee.role)) redirect(roleHome[employee.role]);
  return employee;
}

export function getRoleHome(role: EmployeeRole) {
  return roleHome[role];
}
