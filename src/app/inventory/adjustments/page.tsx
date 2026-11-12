import Link from "next/link";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { AdjustmentForm } from "../adjustment-form";

export const dynamic = "force-dynamic";
export default async function StockAdjustmentPage({ searchParams }: { searchParams: Promise<{ branch?: string }> }) {
  await requireEmployee(["admin", "inventory_manager"]);
  const params = await searchParams;
  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("id,name").eq("is_active", true).order("name");
  const initialBranch = branches?.some((b) => b.id === params.branch) ? params.branch! : branches?.[0]?.id ?? "";
  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl"><Link href="/inventory" className="text-sm underline">← Inventory</Link><h1 className="mt-3 text-2xl font-semibold">Post stock movement</h1><p className="mt-1 text-sm text-slate-600">Opening balances and adjustments are recorded in the permanent inventory ledger. Opening stock can only be posted once per variant.</p><AdjustmentForm branches={branches ?? []} initialBranch={initialBranch}/></div></main>;
}
