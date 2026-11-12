import Link from "next/link";
import { notFound } from "next/navigation";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ProductForm, type ProductOptions } from "../product-form";
import { ProductImages } from "../product-images";
import { formatCurrencyLkr } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function EditProductPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ variantId?: string }> }) {
  await requireEmployee(["admin", "inventory_manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const [{ data: product }, { data: variants }, { data: branches }, { data: categories }, { data: brands }, { data: suppliers }, { data: units }] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_variants").select("*").eq("product_id", id).order("sku"),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name").eq("is_active", true).order("name"),
    supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase.from("units").select("id,name,symbol,decimal_places").eq("is_active", true).order("name"),
  ]);
  if (!product || !variants?.length) notFound();
  const variant = variants.find((row) => row.id === query.variantId) ?? variants[0];
  const [{ data: prices }, { data: stock }, { data: imageRows }, { data: priceHistory }] = await Promise.all([
    supabase.from("product_prices").select("cost_price,marked_price,default_selling_price").eq("variant_id", variant.id).maybeSingle(),
    supabase.from("branch_inventory").select("reorder_level").eq("branch_id", branches?.[0]?.id ?? "").eq("variant_id", variant.id).maybeSingle(),
    supabase.from("product_images").select("id,storage_path,alt_text").eq("product_id", id).order("sort_order"),
    supabase.from("product_price_history").select("cost_price,marked_price,default_selling_price,changed_at,changed_by,reason").eq("variant_id", variant.id).order("changed_at", { ascending: false }).limit(20),
  ]);
  if (!prices) notFound();
  const images = await Promise.all((imageRows ?? []).map(async (image) => {
    const { data } = await supabase.storage.from("product-images").createSignedUrl(image.storage_path, 3600);
    return data?.signedUrl ? { ...image, signed_url: data.signedUrl } : null;
  }));
  const options = { branches: branches ?? [], categories: categories ?? [], brands: brands ?? [], suppliers: suppliers ?? [], units: units ?? [] } as ProductOptions;
  const initial = {
    productId: product.id, variantId: variant.id, branchId: branches?.[0]?.id ?? "",
    name: product.name, description: product.description ?? "", categoryId: product.category_id ?? "",
    subcategoryName: product.subcategory_name ?? "", brandId: product.brand_id ?? "", supplierId: product.supplier_id ?? "",
    sku: variant.sku, barcode: variant.barcode ?? "", variantLabel: variant.variant_label ?? "",
    sizeSpecification: variant.size_specification ?? "", unitId: variant.unit_id, rackLocation: variant.rack_location ?? "",
    costPrice: Number(prices.cost_price), markedPrice: Number(prices.marked_price),
    defaultSellingPrice: Number(prices.default_selling_price), reorderLevel: Number(stock?.reorder_level ?? 0),
    taxRate: Number(variant.tax_rate), isActive: product.is_active && variant.is_active, priceChangeReason: "",
  };

  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl">
    <p className="text-sm text-slate-500"><Link href="/products" className="underline underline-offset-4">Products</Link> · Edit product</p><div className="mt-1 flex flex-wrap items-end justify-between gap-3"><div><h1 className="text-2xl font-semibold">{product.name}</h1><p className="mt-1 text-sm text-slate-500">Variant {variant.sku} · {variants.length} sellable variant{variants.length === 1 ? "" : "s"}</p></div><div className="flex flex-wrap gap-2">{variants.map((row) => <Link key={row.id} href={`/products/${id}?variantId=${row.id}`} className={`rounded-md border px-3 py-2 text-xs ${row.id === variant.id ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-700"}`}>{row.sku}</Link>)}<Link href={`/products/new?productId=${id}`} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs">Add variant</Link></div></div>
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"><ProductForm options={options} initial={initial} /></section>
    <ProductImages productId={id} images={images.filter((image): image is NonNullable<typeof image> => image !== null)} />
    <section className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white"><div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Master price history</h2><p className="mt-1 text-xs text-slate-500">Latest 20 recorded changes for this variant.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Changed</th><th className="px-4 py-3 text-right">Cost</th><th className="px-4 py-3 text-right">Marked</th><th className="px-4 py-3 text-right">Selling</th><th className="px-4 py-3">Reason</th></tr></thead><tbody className="divide-y divide-slate-100">{(priceHistory ?? []).map((entry, index) => <tr key={`${entry.changed_at}-${index}`}><td className="px-4 py-3 text-slate-600">{new Intl.DateTimeFormat("en-LK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Colombo" }).format(new Date(entry.changed_at))}</td><td className="px-4 py-3 text-right">{formatCurrencyLkr(Number(entry.cost_price))}</td><td className="px-4 py-3 text-right">{formatCurrencyLkr(Number(entry.marked_price))}</td><td className="px-4 py-3 text-right">{formatCurrencyLkr(Number(entry.default_selling_price))}</td><td className="px-4 py-3 text-slate-600">{entry.reason || "—"}</td></tr>)}{(!priceHistory || priceHistory.length === 0) && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No price history for this variant.</td></tr>}</tbody></table></div></section>
  </div></main>;
}
