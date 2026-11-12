"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getEmployee } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9._-]{2,31}$/);
const passwordSchema = z.string().min(12).max(128);
const roles = z.enum(["admin", "inventory_manager", "cashier"]);
const optionalEmail = z.union([z.email().max(254), z.literal("")]).transform((v) => v || null);

function authEmail(username: string, contactEmail: string | null) {
  return contactEmail?.toLowerCase() ?? `${username}@accounts.gunawardhana.invalid`;
}

export type EmployeeActionResult = { error?: string; success?: string };

export async function createEmployee(formData: FormData): Promise<EmployeeActionResult> {
  const actor = await getEmployee();
  if (actor?.role !== "admin") return { error: "Only an administrator can create accounts." };
  const parsed = z.object({
    displayName: z.string().trim().min(2).max(120), username: usernameSchema,
    contactEmail: optionalEmail, phone: z.string().trim().max(40),
    password: passwordSchema, role: roles, branchId: z.uuid(),
  }).safeParse({
    displayName: formData.get("displayName"), username: formData.get("username"),
    contactEmail: formData.get("contactEmail") ?? "", phone: formData.get("phone") ?? "",
    password: formData.get("password"), role: formData.get("role"), branchId: formData.get("branchId"),
  });
  if (!parsed.success) return { error: "Check the username, password, and account details. Passwords must be at least 12 characters." };
  try {
    const admin = createAdminClient();
    const loginEmail = authEmail(parsed.data.username, parsed.data.contactEmail);
    const { data, error } = await admin.auth.admin.createUser({
      email: loginEmail, password: parsed.data.password, email_confirm: true,
      user_metadata: { display_name: parsed.data.displayName, username: parsed.data.username },
    });
    if (error || !data.user) return { error: "Could not create the account. The username or email may already be in use." };
    const supabase = await createClient();
    const { error: provisionError } = await supabase.rpc("provision_employee_with_username", {
      p_user_id: data.user.id, p_login_email: loginEmail, p_contact_email: parsed.data.contactEmail,
      p_username: parsed.data.username, p_display_name: parsed.data.displayName, p_phone: parsed.data.phone || null,
      p_role: parsed.data.role, p_branch_id: parsed.data.branchId,
    });
    if (provisionError) {
      await admin.auth.admin.deleteUser(data.user.id);
      if (provisionError.code === "23505") return { error: "That username or email is already in use." };
      return { error: "The account could not be assigned its role and branch; no account was kept." };
    }
  } catch {
    return { error: "Account creation is unavailable. Check the server Supabase secret configuration." };
  }
  revalidatePath("/employees");
  return { success: `Account ${parsed.data.username} was created.` };
}

export async function updateEmployeeDetails(formData: FormData): Promise<EmployeeActionResult> {
  const actor = await getEmployee();
  if (actor?.role !== "admin") return { error: "Only an administrator can edit accounts." };
  const parsed = z.object({
    userId: z.uuid(), username: usernameSchema, displayName: z.string().trim().min(2).max(120),
    contactEmail: optionalEmail, phone: z.string().trim().max(40), branchId: z.uuid(), reason: z.string().trim().min(3).max(500),
  }).safeParse({
    userId: formData.get("userId"), username: formData.get("username"), displayName: formData.get("displayName"),
    contactEmail: formData.get("contactEmail") ?? "", phone: formData.get("phone") ?? "",
    branchId: formData.get("branchId"), reason: formData.get("reason"),
  });
  if (!parsed.success) return { error: "Check the edited user details and reason." };
  try {
    const admin = createAdminClient();
    const { data: current, error: currentError } = await admin.auth.admin.getUserById(parsed.data.userId);
    if (currentError || !current.user) return { error: "User account was not found." };
    const loginEmail = authEmail(parsed.data.username, parsed.data.contactEmail);
    const { error: authError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
      email: loginEmail, email_confirm: true,
      user_metadata: { ...current.user.user_metadata, display_name: parsed.data.displayName, username: parsed.data.username },
    });
    if (authError) return { error: "Could not update the account email. It may already be in use." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_employee_details", {
      p_user_id: parsed.data.userId, p_username: parsed.data.username, p_login_email: loginEmail,
      p_contact_email: parsed.data.contactEmail, p_display_name: parsed.data.displayName,
      p_phone: parsed.data.phone || null, p_branch_id: parsed.data.branchId, p_reason: parsed.data.reason,
    });
    if (error) {
      await admin.auth.admin.updateUserById(parsed.data.userId, { email: current.user.email!, email_confirm: true });
      return { error: error.code === "23505" ? "That username or email is already in use." : "The account changes could not be saved." };
    }
  } catch { return { error: "Account editing is unavailable. Check server Supabase configuration." }; }
  revalidatePath("/employees");
  return { success: "Account details updated." };
}

export async function resetEmployeePassword(formData: FormData): Promise<EmployeeActionResult> {
  const actor = await getEmployee();
  const parsed = z.object({ userId: z.uuid(), password: passwordSchema, reason: z.string().trim().min(3).max(500) })
    .safeParse({ userId: formData.get("userId"), password: formData.get("password"), reason: formData.get("reason") });
  if (actor?.role !== "admin" || !parsed.success || actor.id === parsed.data.userId) return { error: "Check the account and password reset details." };
  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, { password: parsed.data.password });
    if (error) return { error: "Password reset failed. Use a different password of at least 12 characters." };
    const supabase = await createClient();
    const { error: auditError } = await supabase.rpc("record_employee_password_reset", { p_user_id: parsed.data.userId, p_reason: parsed.data.reason });
    if (auditError) return { error: "Password changed, but the audit record failed. Contact the system administrator." };
  } catch { return { error: "Password reset is unavailable. Check server Supabase configuration." }; }
  revalidatePath("/employees");
  return { success: "Password reset. The new password was not saved in the application database." };
}

const roleChangeSchema = z.object({ userId: z.uuid(), role: roles, reason: z.string().trim().min(3).max(500) });
export async function updateEmployeeRole(formData: FormData) {
  const actor = await getEmployee();
  const values = roleChangeSchema.safeParse({ userId: formData.get("userId"), role: formData.get("role"), reason: formData.get("reason") });
  if (actor?.role !== "admin" || !values.success || actor.id === values.data.userId) redirect("/employees?status=update_failed");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_employee_role", { p_user_id: values.data.userId, p_role: values.data.role, p_reason: values.data.reason });
  if (error) redirect("/employees?status=update_failed");
  revalidatePath("/employees");
  redirect("/employees?status=updated");
}

const activeSchema = z.object({ userId: z.uuid(), isActive: z.enum(["true", "false"]), reason: z.string().trim().min(3).max(500) });
export async function updateEmployeeStatus(formData: FormData) {
  const actor = await getEmployee();
  const values = activeSchema.safeParse({ userId: formData.get("userId"), isActive: formData.get("isActive"), reason: formData.get("reason") });
  if (actor?.role !== "admin" || !values.success || actor.id === values.data.userId) redirect("/employees?status=update_failed");
  const supabase = await createClient();
  let admin: ReturnType<typeof createAdminClient>;
  try { admin = createAdminClient(); } catch { redirect("/employees?status=update_failed"); }
  const { data: targetProfile, error: targetError } = await admin.from("profiles").select("username,is_active").eq("id", values.data.userId).maybeSingle();
  if (targetError || !targetProfile || targetProfile.username.startsWith("deleted-") || targetProfile.is_active !== (values.data.isActive === "false")) redirect("/employees?status=update_failed");
  const shouldActivate = values.data.isActive === "true";
  const { error: authError } = await admin.auth.admin.updateUserById(values.data.userId, {
    ban_duration: shouldActivate ? "none" : "876000h",
  });
  if (authError) redirect("/employees?status=update_failed");
  const { error } = await supabase.rpc("set_employee_active", { p_user_id: values.data.userId, p_is_active: values.data.isActive === "true", p_reason: values.data.reason });
  if (error) {
    await admin.auth.admin.updateUserById(values.data.userId, { ban_duration: shouldActivate ? "876000h" : "none" });
    redirect("/employees?status=update_failed");
  }
  revalidatePath("/employees");
  redirect("/employees?status=updated");
}

export async function deleteEmployee(formData: FormData): Promise<EmployeeActionResult> {
  const actor = await getEmployee();
  const parsed = z.object({ userId: z.uuid(), reason: z.string().trim().min(3).max(500) })
    .safeParse({ userId: formData.get("userId"), reason: formData.get("reason") });
  if (actor?.role !== "admin" || !parsed.success || actor.id === parsed.data.userId) return { error: "You cannot delete this account." };
  try {
    const admin = createAdminClient();
    const { data: authData, error: getError } = await admin.auth.admin.getUserById(parsed.data.userId);
    if (getError || !authData.user) return { error: "User account was not found." };
    const deletedEmail = `deleted+${parsed.data.userId.replaceAll("-", "")}@accounts.gunawardhana.invalid`;
    const { error: updateError } = await admin.auth.admin.updateUserById(parsed.data.userId, {
      email: deletedEmail, email_confirm: true, ban_duration: "876000h",
    });
    if (updateError) return { error: "Could not disable the Auth account." };
    const supabase = await createClient();
    const { error } = await supabase.rpc("delete_employee_account", { p_user_id: parsed.data.userId, p_reason: parsed.data.reason });
    if (error) {
      await admin.auth.admin.updateUserById(parsed.data.userId, { email: authData.user.email!, email_confirm: true, ban_duration: "none" });
      return { error: "The account could not be removed from access." };
    }
  } catch { return { error: "Account deletion is unavailable. Check server Supabase configuration." }; }
  revalidatePath("/employees");
  return { success: "Account deleted from sign-in access. Historical business records are retained for audit." };
}
