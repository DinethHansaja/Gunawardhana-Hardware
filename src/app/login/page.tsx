import { LoginForm } from "./login-form";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getEmployee, getRoleHome } from "@/lib/auth/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const employee = await getEmployee();
  if (employee) redirect(getRoleHome(employee.role));
  const configured = isSupabaseConfigured();
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Gunawardhana Hardware</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Sign in to your workspace</h1>
          <p className="mt-2 text-sm text-slate-600">Use the account issued by your store administrator.</p>
        </div>
        {!configured && <p role="status" className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Authentication is not connected yet. Set the Supabase URL and publishable key to enable sign-in.</p>}
        <LoginForm disabled={!configured} />
        <p className="mt-5 text-center text-xs text-slate-500">Store access is managed by your administrator.</p>
      </div>
    </main>
  );
}
