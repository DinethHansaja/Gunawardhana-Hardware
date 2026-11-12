import Link from "next/link";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatQuantity } from "@/lib/format";

export const dynamic = "force-dynamic";
type Row = { product_id: string; variant_id: string; product_name: string; sku: string; variant: string | null; unit: string; quantity: number | string; reorder_level: number | string; is_active: boolean };

export default async function InventoryHome({ searchParams }: { searchParams: Promise<{ branch?: string; q?: string }> }) {
  await requireEmployee(["admin", "inventory_manager"]);
  const params = await searchParams;
  const supabase = await createClient();
  const [{ data: branches, error: branchError }] = await Promise.all([
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
  ]);
  const branchId = branches?.some((b) => b.id === params.branch) ? params.branch! : branches?.[0]?.id;
  const { data, error } = branchId ? await supabase.rpc("search_catalog_products", { p_branch_id: branchId, p_query: (params.q ?? "").slice(0, 120), p_limit: 100, p_offset: 0 }) : { data: [], error: null };
  const rows = (data ?? []) as Row[];
  const low = rows.filter((r) => r.is_active && Number(r.quantity) <= Number(r.reorder_level));
  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">Gunawardhana Hardware · Inventory</p><h1 className="mt-1 text-2xl font-semibold">Stock control</h1><p className="mt-1 text-sm text-slate-500">Live balances, reorder alerts, and ledger-backed adjustments.</p></div><div className="flex gap-2"><Link href="/inventory/movements" className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">Movement history</Link><Link href={`/inventory/adjustments?branch=${branchId ?? ""}`} className="rounded-md bg-slate-800 px-4 py-2.5 text-sm text-white">Post stock</Link></div></div>
    <form method="get" className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_240px_auto]"><input name="q" defaultValue={params.q} aria-label="Search stock" placeholder="Search name, SKU, barcode, category, or size" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm"/><select name="branch" defaultValue={branchId} aria-label="Branch" className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">{(branches ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select><button className="rounded-md border border-slate-300 px-4 py-2.5 text-sm">Search</button></form>
    {(error || branchError) && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Inventory could not be loaded. Confirm database migrations and branch access.</p>}
    <section className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4"><p className="font-medium text-amber-950">Reorder alerts · {low.length} in the first 100 results</p>{low.length > 0 && <p className="mt-1 text-sm text-amber-900">{low.slice(0,5).map((r) => `${r.product_name} (${r.sku})`).join(" · ")}{low.length > 5 ? " · …" : ""}</p>}</section>
    <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 bg-white"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Product</th><th className="px-4 py-3">SKU</th><th className="px-4 py-3 text-right">On hand</th><th className="px-4 py-3 text-right">Reorder level</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map((r) => <tr key={r.variant_id}><td className="px-4 py-3 font-medium">{r.product_name}<span className="ml-2 text-xs font-normal text-slate-500">{r.variant || "Standard"}</span></td><td className="px-4 py-3">{r.sku}</td><td className={`px-4 py-3 text-right ${r.is_active && Number(r.quantity)<=Number(r.reorder_level)?"font-semibold text-amber-800":""}`}>{formatQuantity(Number(r.quantity),6)} {r.unit}</td><td className="px-4 py-3 text-right">{formatQuantity(Number(r.reorder_level),6)} {r.unit}</td><td className="px-4 py-3">{r.is_active ? "Active" : "Archived"}</td></tr>)}{rows.length===0&&<tr><td colSpan={5} className="px-4 py-10 text-center text-slate-500">No matching stock records.</td></tr>}</tbody></table></div>
  </div></main>;
}
