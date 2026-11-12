import Link from "next/link";
import { requireEmployee } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ProductForm, type ProductOptions } from "../product-form";

export const dynamic = "force-dynamic";

export default async function NewProductPage({ searchParams }: { searchParams: Promise<{ productId?: string }> }) {
  await requireEmployee(["admin", "inventory_manager"]);
  const { productId } = await searchParams;
  const supabase = await createClient();
  const [{ data: existingProduct }, { data: existingVariants }, { data: branches }, { data: categories }, { data: brands }, { data: suppliers }, { data: units }] = await Promise.all([
    productId ? supabase.from("products").select("*").eq("id", productId).maybeSingle() : Promise.resolve({ data: null }),
    productId ? supabase.from("product_variants").select("id").eq("product_id", productId).order("sku").limit(1) : Promise.resolve({ data: [] }),
    supabase.from("branches").select("id,name").eq("is_active", true).order("name"),
    supabase.from("categories").select("id,name").eq("is_active", true).order("name"),
    supabase.from("brands").select("id,name").eq("is_active", true).order("name"),
    supabase.from("suppliers").select("id,name").eq("is_active", true).order("name"),
    supabase.from("units").select("id,name,symbol,decimal_places").eq("is_active", true).order("name"),
  ]);
  if (productId && !existingProduct) return <main className="p-8 text-sm text-red-800">Product was not found.</main>;
  const { data: existingVariant } = productId && existingVariants?.[0]
    ? await supabase.from("product_variants").select("unit_id").eq("id", existingVariants[0].id).maybeSingle()
    : { data: null };
  const { data: existingPrices } = productId && existingVariants?.[0]
    ? await supabase.from("product_prices").select("cost_price,marked_price,default_selling_price").eq("variant_id", existingVariants[0].id).maybeSingle()
    : { data: null };
  const options = { branches: branches ?? [], categories: categories ?? [], brands: brands ?? [], suppliers: suppliers ?? [], units: units ?? [] } as ProductOptions;
  const initial = existingProduct ? {
    productId: existingProduct.id, name: existingProduct.name, description: existingProduct.description ?? "",
    categoryId: existingProduct.category_id ?? "", subcategoryName: existingProduct.subcategory_name ?? "",
    brandId: existingProduct.brand_id ?? "", supplierId: existingProduct.supplier_id ?? "",
    unitId: existingVariant?.unit_id ?? options.units[0]?.id ?? "",
    costPrice: Number(existingPrices?.cost_price ?? 0), markedPrice: Number(existingPrices?.marked_price ?? 0),
    defaultSellingPrice: Number(existingPrices?.default_selling_price ?? 0), isActive: existingProduct.is_active,
  } : undefined;
  return <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8"><div className="mx-auto max-w-4xl">
    <p className="text-sm text-slate-500"><Link href="/products" className="underline underline-offset-4">Products</Link> · {existingProduct ? "Add variant" : "New product"}</p><h1 className="mt-1 text-2xl font-semibold">{existingProduct ? `Add a variant to ${existingProduct.name}` : "Create product"}</h1><p className="mt-1 text-sm text-slate-500">{existingProduct ? "Create another SKU or barcode for this product." : "Create a catalog record and its first sellable variant."}</p>
    <section className="mt-6 rounded-lg border border-slate-200 bg-white p-5 sm:p-6"><ProductForm options={options} initial={initial} /></section>
  </div></main>;
}
