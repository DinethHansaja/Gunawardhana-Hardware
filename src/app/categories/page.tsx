import Link from "next/link";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { CategoryForm } from "./category-form";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  await requireEmployee(["admin", "inventory_manager"]);
  const supabase = await createClient();
  const { data: categories, error } = await supabase.from("categories").select("id,name,parent_id,is_active").order("name");
  const rows = categories ?? [];
  const names = new Map(rows.map((category) => [category.id, category.name]));
  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-5xl">
    <p className="text-sm text-slate-500"><Link href="/products" className="underline underline-offset-4">Products</Link> · Categories</p><h1 className="mt-1 text-2xl font-semibold">Categories</h1><p className="mt-1 text-sm text-slate-500">Organize the product catalog into parent and child categories.</p>
    {error && <p role="alert" className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">Categories could not be loaded. Check database setup.</p>}
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5"><h2 className="mb-4 text-sm font-semibold">Add category</h2><CategoryForm parents={rows} /></section>
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Existing categories</h2></div><div className="divide-y divide-slate-100">
      {rows.map((category) => <div key={category.id} className="px-5 py-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">{category.name}</p><p className="mt-1 text-xs text-slate-500">Parent: {category.parent_id ? names.get(category.parent_id) ?? "Unavailable" : "—"}</p></div><span className={`rounded-full px-2 py-1 text-xs ${category.is_active ? "bg-green-50 text-green-800" : "bg-slate-100 text-slate-600"}`}>{category.is_active ? "Active" : "Archived"}</span></div><CategoryForm parents={rows} initial={{ id: category.id, name: category.name, parentId: category.parent_id ?? "", isActive: category.is_active }} /></div>)}
      {rows.length === 0 && <p className="px-5 py-8 text-center text-sm text-slate-500">No categories added yet.</p>}
    </div></section>
  </div></main>;
}
