"use server";

import { revalidatePath } from "next/cache";
import { getEmployee } from "@/lib/auth/server";
import { categoryFormSchema, productFormSchema } from "@/lib/validation/product";
import { createClient } from "@/lib/supabase/server";

export type SaveProductResult = { error?: string; productId?: string; variantId?: string };

export async function saveProduct(values: unknown): Promise<SaveProductResult> {
  const actor = await getEmployee();
  if (!actor || !["admin", "inventory_manager"].includes(actor.role)) return { error: "You are not authorized to manage products." };
  const parsed = productFormSchema.safeParse(values);
  if (!parsed.success) return { error: "Some product details are invalid. Review the highlighted fields." };
  const product = parsed.data;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_product", {
      p_branch_id: product.branchId,
      p_product: {
        id: product.productId || null,
        name: product.name,
        description: product.description || null,
        category_id: product.categoryId || null,
        subcategory_name: product.subcategoryName || null,
        brand_id: product.brandId || null,
        supplier_id: product.supplierId || null,
        is_active: product.isActive,
      },
      p_variant: {
        id: product.variantId || null,
        sku: product.sku,
        barcode: product.barcode || null,
        variant_label: product.variantLabel || null,
        size_specification: product.sizeSpecification || null,
        unit_id: product.unitId,
        rack_location: product.rackLocation || null,
        reorder_level: product.reorderLevel,
        tax_rate: product.taxRate,
      },
      p_prices: {
        cost_price: product.costPrice,
        marked_price: product.markedPrice,
        default_selling_price: product.defaultSellingPrice,
      },
      p_reason: product.priceChangeReason || null,
    });
    if (error || !data) return { error: catalogError(error?.message) };
    const saved = data as { product_id: string; variant_id: string };
    revalidatePath("/products");
    revalidatePath(`/products/${saved.product_id}`);
    return { productId: saved.product_id, variantId: saved.variant_id };
  } catch {
    return { error: "Could not save the product. Check the database connection and try again." };
  }
}

function catalogError(message?: string) {
  if (message?.includes("products_sku_key") || message?.includes("product_variants_sku_key")) return "That SKU is already in use.";
  if (message?.includes("barcode")) return "That barcode is already in use.";
  if (message?.includes("category")) return "The selected category is unavailable.";
  return "Product could not be saved. Review the values and try again.";
}

export async function saveCategory(values: unknown) {
  const actor = await getEmployee();
  if (!actor || !["admin", "inventory_manager"].includes(actor.role)) return { error: "You are not authorized to manage categories." };
  const parsed = categoryFormSchema.safeParse(values);
  if (!parsed.success) return { error: "Category details are invalid." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("save_category", {
      p_id: parsed.data.id || null,
      p_name: parsed.data.name,
      p_parent_id: parsed.data.parentId || null,
      p_is_active: parsed.data.isActive,
    });
    if (error || !data) return { error: "Category could not be saved." };
    revalidatePath("/categories"); revalidatePath("/products");
    return { id: data as string };
  } catch {
    return { error: "Category could not be saved. Check the database connection and try again." };
  }
}
