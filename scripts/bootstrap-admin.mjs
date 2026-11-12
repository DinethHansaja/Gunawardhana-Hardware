import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { stdin, stdout } from "node:process";

loadEnvConfig(process.cwd());

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !secret || /placeholder|your-project|your_key/i.test(`${url} ${secret}`)) {
  console.error("Set the Supabase project URL and server-only secret in .env.local first.");
  process.exit(1);
}

function readHidden(prompt) {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) return reject(new Error("Run this command in an interactive terminal."));
    stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    let value = "";
    const onData = (chunk) => {
      for (const byte of chunk) {
        if (byte === 3) {
          stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData);
          stdout.write("\n"); reject(new Error("Cancelled.")); return;
        }
        if (byte === 13 || byte === 10) {
          stdin.setRawMode(false); stdin.pause(); stdin.off("data", onData);
          stdout.write("\n"); resolve(value); return;
        }
        if (byte === 127 || byte === 8) value = value.slice(0, -1);
        else if (byte >= 32) value += String.fromCharCode(byte);
      }
    };
    stdin.on("data", onData);
  });
}

const supabase = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
const { data: existing, error: lookupError } = await supabase.from("profiles")
  .select("id, email, display_name, is_active, user_roles(role_id)").eq("username", "gunawardhana").maybeSingle();
if (lookupError) {
  console.error("Could not check for the initial Admin. Apply the username/user-management migration first.");
  process.exit(1);
}
if (existing && (!existing.is_active || !existing.user_roles?.some((r) => r.role_id === "admin"))) {
  console.error("The default username already belongs to a non-Admin or inactive account. Resolve that in Supabase before continuing.");
  process.exit(1);
}

let password;
try { password = await readHidden("Enter the new Admin password (input hidden): "); }
catch (error) { console.error(error.message); process.exit(1); }
if (password.length < 12 || password.length > 128) {
  console.error("Use a password between 12 and 128 characters.");
  process.exit(1);
}

let userId = existing?.id;
if (existing) {
  const { error } = await supabase.auth.admin.updateUserById(userId, { password });
  password = "";
  if (error) { console.error("Could not update the existing Admin password."); process.exit(1); }
  await supabase.from("audit_logs").insert({
    actor_id: userId, action: "initial_admin_password_reset", entity_type: "profile", entity_id: userId,
    reason: "Password set through the local hidden-prompt bootstrap utility",
  });
  console.log("Admin password updated by Supabase Auth. No plaintext password was saved.");
} else {
  const authEmail = "gunawardhana@accounts.gunawardhana.invalid";
  const { data, error } = await supabase.auth.admin.createUser({
    email: authEmail, password, email_confirm: true,
    user_metadata: { username: "gunawardhana", display_name: "Gunawardhana Administrator" },
  });
  password = "";
  if (error || !data.user) {
    console.error("Could not create the initial Admin Auth account.");
    process.exit(1);
  }
  userId = data.user.id;
  const { error: bootstrapError } = await supabase.rpc("bootstrap_first_admin", {
    p_user_id: userId, p_login_email: authEmail, p_display_name: "Gunawardhana Administrator",
  });
  if (bootstrapError) {
    await supabase.auth.admin.deleteUser(userId);
    console.error("Could not assign the initial Admin role; the temporary Auth account was removed.");
    process.exit(1);
  }
  console.log("Initial Admin account created. Sign in with username gunawardhana and the password you entered.");
}
