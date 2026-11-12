import { requireEmployee } from "@/lib/auth/server";
import { SignOutButton } from "@/components/sign-out-button";
import { createClient } from "@/lib/supabase/server";
import { PosScreen, type PosBranch } from "./pos-screen";

export const dynamic = "force-dynamic";

export default async function PosHome() {
  const employee = await requireEmployee(["admin", "cashier"]);
  const supabase = await createClient();
  const { data: branches, error } = await supabase.from("branches").select("id, name, address, phone").eq("is_active", true).order("name");
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10 text-slate-900 sm:px-8">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between"><p className="text-sm text-slate-500">Gunawardhana Hardware · Point of sale</p><SignOutButton /></div>
        <h1 className="mt-2 text-2xl font-semibold">Point of sale</h1>
        <p className="mt-2 text-sm text-slate-600">Signed in as {employee.displayName}.</p>
        {error && <p role="alert" className="mt-5 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Product database is not ready. Apply the Supabase migrations and verify branch access.</p>}
        {!error && branches && branches.length > 0 && <PosScreen branches={branches as PosBranch[]} role={employee.role === "admin" ? "admin" : "cashier"} />}
        {!error && (!branches || branches.length === 0) && <p className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">No active branch is available for this account.</p>}
      </div>
    </main>
  );
}
