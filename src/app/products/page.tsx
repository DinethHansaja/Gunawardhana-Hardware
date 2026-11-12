import Link from "next/link";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatCurrencyLkr, formatQuantity } from "@/lib/format";

export const dynamic = "force-dynamic";

type CatalogRow = {
  product_id: string; variant_id: string; product_name: string; sku: string; barcode: string | null;
  category: string | null; brand: string | null; variant: string | null; size_specification: string | null;
  unit: string; cost_price: string | number; marked_price: string | number; default_selling_price: string | number;
  quantity: string | number; reorder_level: string | number; is_active: boolean;
};

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; branch?: string; page?: string }> }) {
  const employee = await requireEmployee(["admin", "inventory_manager"]);
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 120);
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const supabase = await createClient();
  const { data: branches, error: branchError } = await supabase.from("branches").select("id,name").eq("is_active", true).order("name");
  const branchId = branches?.some((branch) => branch.id === params.branch) ? params.branch! : branches?.[0]?.id;
  const { data, error } = branchId ? await supabase.rpc("search_catalog_products", {
    p_branch_id: branchId, p_query: query, p_limit: 51, p_offset: (page - 1) * 50,
  }) : { data: [], error: null };
  const rows = (data ?? []) as CatalogRow[];
  const hasMore = rows.length > 50;
  const shown = rows.slice(0, 50);

  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-7xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-slate-500">Gunawardhana Hardware · Catalog</p><h1 className="mt-1 text-2xl font-semibold">Products</h1><p className="mt-1 text-sm text-slate-500">Catalog and sellable variant records · {employee.role === "admin" ? "Administrator" : "Inventory Staff"}</p></div><div className="flex gap-2"><Link href="/categories" className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium hover:bg-slate-50">Categories</Link><Link href="/products/new" className="rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700">New product</Link></div></div>
    <form method="get" className="mt-6 grid gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:grid-cols-[1fr_240px_auto]">
      <label className="sr-only" htmlFor="catalog-query">Search catalog</label><input id="catalog-query" name="q" defaultValue={query} placeholder="Search name, SKU, barcode, brand, category, or size" className="rounded-md border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200" />
      <label className="sr-only" htmlFor="catalog-branch">Branch</label><select id="catalog-branch" name="branch" defaultValue={branchId} className="rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm">{(branches ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      <button className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium hover:bg-slate-50">Search</button>
    </form>
    {(error || branchError) && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Catalog data could not be loaded. Verify the migrations and branch access.</p>}
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-100 px-5 py-3"><p className="text-xs text-slate-500">Showing {shown.length} variants</p><p className="text-xs text-slate-500">Stock and prices are current database values.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Product / variant</th><th className="px-4 py-3">SKU / barcode</th><th className="px-4 py-3">Category / brand</th><th className="px-4 py-3 text-right">Stock</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Default price</th><th className="px-4 py-3">Status</th><th className="px-4 py-3"></th></tr></thead><tbody className="divide-y divide-slate-100">
      {shown.map((item) => <tr key={item.variant_id} className="hover:bg-slate-50"><td className="px-4 py-3"><p className="font-medium text-slate-800">{item.product_name}</p><p className="mt-0.5 text-xs text-slate-500">{[item.variant,item.size_specification].filter(Boolean).join(" · ") || "Standard variant"}</p></td><td className="px-4 py-3"><p className="font-medium">{item.sku}</p><p className="mt-0.5 text-xs text-slate-500">{item.barcode || "No barcode"}</p></td><td className="px-4 py-3 text-slate-600">{item.category || "—"}{item.brand ? ` · ${item.brand}` : ""}</td><td className="px-4 py-3 text-right">{formatQuantity(Number(item.quantity), 6)} {item.unit}<p className="mt-0.5 text-xs text-slate-500">Reorder at {formatQuantity(Number(item.reorder_level), 6)}</p></td><td className="px-4 py-3 text-right text-slate-600">{formatCurrencyLkr(Number(item.cost_price))}</td><td className="px-4 py-3 text-right font-medium">{formatCurrencyLkr(Number(item.default_selling_price))}</td><td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs ${item.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{item.is_active ? "Active" : "Archived"}</span></td><td className="px-4 py-3"><Link href={`/products/${item.product_id}?variantId=${item.variant_id}`} className="text-xs font-medium underline underline-offset-4">Edit</Link></td></tr>)}
      {shown.length === 0 && <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">No products match this search.</td></tr>}
    </tbody></table></div></div>
    <div className="mt-4 flex justify-between"><p className="text-xs text-slate-500">Page {page}</p><div className="flex gap-2">{page > 1 && <Link href={`/products?q=${encodeURIComponent(query)}&branch=${branchId}&page=${page - 1}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Previous</Link>}{hasMore && <Link href={`/products?q=${encodeURIComponent(query)}&branch=${branchId}&page=${page + 1}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm">Next</Link>}</div></div>
  </div></main>;
}
