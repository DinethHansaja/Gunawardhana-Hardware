"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { saveProduct } from "./actions";
import { productFormSchema, type ProductFormValues } from "@/lib/validation/product";

type Option = { id: string; name: string };
type UnitOption = Option & { symbol: string; decimal_places: number };
export type ProductOptions = { branches: Option[]; categories: Option[]; brands: Option[]; suppliers: Option[]; units: UnitOption[] };

export function ProductForm({ options, initial }: { options: ProductOptions; initial?: Partial<ProductFormValues> }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const defaults: ProductFormValues = {
    productId: "", variantId: "", branchId: options.branches[0]?.id ?? "",
    name: "", description: "", categoryId: "", subcategoryName: "", brandId: "", supplierId: "",
    sku: "", barcode: "", variantLabel: "", sizeSpecification: "", unitId: options.units[0]?.id ?? "",
    rackLocation: "", costPrice: 0, markedPrice: 0, defaultSellingPrice: 0, reorderLevel: 0,
    taxRate: 0, isActive: true, priceChangeReason: "", ...initial,
  };
  const { register, handleSubmit, control, formState: { errors } } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema), defaultValues: defaults,
  });
  const selectedUnit = useWatch({ control, name: "unitId" });
  const reorderStep = useMemo(() => 10 ** -(options.units.find((unit) => unit.id === selectedUnit)?.decimal_places ?? 0), [options.units, selectedUnit]);

  async function submit(values: ProductFormValues) {
    setSaving(true); setServerError(null);
    try {
      const result = await saveProduct(values);
      if (result.error) { setServerError(result.error); return; }
      router.push(`/products/${result.productId}?variantId=${result.variantId}`);
      router.refresh();
    } catch { setServerError("Product could not be saved. Try again."); }
    finally { setSaving(false); }
  }

  const textClass = "mt-1.5 block w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
  const labelClass = "block text-sm font-medium text-slate-700";
  function error(field: keyof ProductFormValues) {
    const message = errors[field]?.message;
    return message ? <p className="mt-1 text-xs text-red-700">{String(message)}</p> : null;
  }

  return <form onSubmit={handleSubmit(submit)} className="space-y-6">
    {!options.branches.length && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">No active branch is available to this account.</p>}
    {!options.units.length && <p role="alert" className="rounded-md bg-amber-50 p-3 text-sm text-amber-900">Create an active unit before saving a sellable variant.</p>}
    <input type="hidden" {...register("productId")} /><input type="hidden" {...register("variantId")} />

    <section><h2 className="text-sm font-semibold text-slate-800">Product details</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className={`${labelClass} sm:col-span-2`}>Product name<input {...register("name")} maxLength={200} className={textClass} />{error("name")}</label>
      <label className={`${labelClass} sm:col-span-2`}>Description<textarea {...register("description")} rows={3} maxLength={2000} className={textClass} />{error("description")}</label>
      <label className={labelClass}>Category<select {...register("categoryId")} className={textClass}><option value="">Uncategorized</option>{options.categories.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className={labelClass}>Subcategory<input {...register("subcategoryName")} maxLength={120} className={textClass} /></label>
      <label className={labelClass}>Brand<select {...register("brandId")} className={textClass}><option value="">No brand</option>{options.brands.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
      <label className={labelClass}>Preferred supplier<select {...register("supplierId")} className={textClass}><option value="">No supplier</option>{options.suppliers.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
    </div></section>

    <section className="border-t border-slate-100 pt-5"><h2 className="text-sm font-semibold text-slate-800">Sellable variant</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>SKU<input {...register("sku")} maxLength={80} className={textClass} />{error("sku")}</label>
      <label className={labelClass}>Barcode<input {...register("barcode")} maxLength={100} className={textClass} />{error("barcode")}</label>
      <label className={labelClass}>Variant label<input {...register("variantLabel")} placeholder="e.g. Heavy duty" maxLength={120} className={textClass} /></label>
      <label className={labelClass}>Size / specification<input {...register("sizeSpecification")} placeholder="e.g. 1 inch · 3 m" maxLength={160} className={textClass} /></label>
      <label className={labelClass}>Unit<select {...register("unitId")} className={textClass}>{options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} ({unit.symbol})</option>)}</select>{error("unitId")}</label>
      <label className={labelClass}>Rack / location<input {...register("rackLocation")} maxLength={120} className={textClass} /></label>
      <label className={labelClass}>Reorder level<input type="number" min="0" step={reorderStep} {...register("reorderLevel", { valueAsNumber: true })} className={textClass} />{error("reorderLevel")}</label>
      <label className={labelClass}>Tax rate (%)<input type="number" min="0" max="100" step="0.01" {...register("taxRate", { valueAsNumber: true })} className={textClass} />{error("taxRate")}</label>
      <label className={`${labelClass} flex items-center gap-2`}><input type="checkbox" {...register("isActive")} className="size-4 accent-slate-800" />Active for sales</label>
    </div></section>

    <section className="border-t border-slate-100 pt-5"><h2 className="text-sm font-semibold text-slate-800">Master prices</h2><p className="mt-1 text-xs text-slate-500">Changes are recorded in price history. A cashier’s negotiated bill price never changes these values.</p><div className="mt-4 grid gap-4 sm:grid-cols-3">
      <label className={labelClass}>Cost price · LKR<input type="number" min="0" step="0.01" {...register("costPrice", { valueAsNumber: true })} className={textClass} />{error("costPrice")}</label>
      <label className={labelClass}>Marked price · LKR<input type="number" min="0" step="0.01" {...register("markedPrice", { valueAsNumber: true })} className={textClass} />{error("markedPrice")}</label>
      <label className={labelClass}>Default selling price · LKR<input type="number" min="0" step="0.01" {...register("defaultSellingPrice", { valueAsNumber: true })} className={textClass} />{error("defaultSellingPrice")}</label>
      <label className={`${labelClass} sm:col-span-3`}>Price change reason<input {...register("priceChangeReason")} placeholder="Required for meaningful price changes" maxLength={500} className={textClass} /></label>
    </div></section>

    {serverError && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-800">{serverError}</p>}
    <div className="flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><button type="button" onClick={() => router.push("/products")} className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button type="submit" disabled={saving || !options.branches.length || !options.units.length} className="rounded-md bg-slate-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">{saving ? "Saving…" : "Save product"}</button></div>
  </form>;
}
