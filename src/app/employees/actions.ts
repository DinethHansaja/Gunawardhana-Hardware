"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getEmployee } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const inviteSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  phone: z.string().trim().max(40),
  role: z.enum(["admin", "inventory_manager", "cashier"]),
  branchId: z.uuid(),
});

export type InviteEmployeeResult = { error?: string; success?: string };

export async function inviteEmployee(formData: FormData): Promise<InviteEmployeeResult> {
  const actor = await getEmployee();
  if (actor?.role !== "admin") return { error: "You are not authorized to manage employees." };

  const values = inviteSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    phone: formData.get("phone") ?? "",
    role: formData.get("role"),
    branchId: formData.get("branchId"),
  });
  if (!values.success) return { error: "Check the employee details and try again." };

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch {
    return { error: "Employee invitations are unavailable until server-side Supabase configuration is complete." };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const { data, error: inviteError } = await admin.auth.admin.inviteUserByEmail(values.data.email, {
    data: { display_name: values.data.displayName },
    ...(siteUrl ? { redirectTo: new URL("/auth/confirm", siteUrl).toString() } : {}),
  });
  if (inviteError || !data.user) return { error: "Could not create the invitation. Check whether this email already has an account." };

  const supabase = await createClient();
  const { error: provisioningError } = await supabase.rpc("provision_employee", {
    p_user_id: data.user.id,
    p_email: values.data.email,
    p_display_name: values.data.displayName,
    p_phone: values.data.phone || null,
    p_role: values.data.role,
    p_branch_id: values.data.branchId,
  });
  if (provisioningError) {
    await admin.auth.admin.deleteUser(data.user.id);
    return { error: "The account could not be assigned its role and branch. The pending invitation was removed." };
  }

  revalidatePath("/employees");
  return { success: `Invitation sent to ${values.data.email}.` };
}

const roleChangeSchema = z.object({
  userId: z.uuid(),
  role: z.enum(["admin", "inventory_manager", "cashier"]),
  reason: z.string().trim().min(3).max(500),
});

export async function updateEmployeeRole(formData: FormData) {
  const actor = await getEmployee();
  const values = roleChangeSchema.safeParse({
    userId: formData.get("userId"), role: formData.get("role"), reason: formData.get("reason"),
  });
  if (actor?.role !== "admin" || !values.success || actor.id === values.data.userId) {
    redirect("/employees?status=update_failed");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_role", {
    p_user_id: values.data.userId, p_role: values.data.role, p_reason: values.data.reason,
  });
  if (error) redirect("/employees?status=update_failed");
  revalidatePath("/employees");
  redirect("/employees?status=updated");
}

const activeSchema = z.object({
  userId: z.uuid(),
  isActive: z.enum(["true", "false"]),
  reason: z.string().trim().min(3).max(500),
});

export async function updateEmployeeStatus(formData: FormData) {
  const actor = await getEmployee();
  const values = activeSchema.safeParse({
    userId: formData.get("userId"), isActive: formData.get("isActive"), reason: formData.get("reason"),
  });
  if (actor?.role !== "admin" || !values.success || actor.id === values.data.userId) {
    redirect("/employees?status=update_failed");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_active", {
    p_user_id: values.data.userId, p_is_active: values.data.isActive === "true", p_reason: values.data.reason,
  });
  if (error) redirect("/employees?status=update_failed");
  revalidatePath("/employees");
  redirect("/employees?status=updated");
}
