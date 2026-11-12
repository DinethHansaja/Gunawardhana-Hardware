import { z } from "zod";

const optionalUuid = z.union([z.uuid(), z.literal("")]);

export const productFormSchema = z.object({
  productId: optionalUuid,
  variantId: optionalUuid,
  branchId: z.uuid(),
  name: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2000),
  categoryId: optionalUuid,
  subcategoryName: z.string().trim().max(120),
  brandId: optionalUuid,
  supplierId: optionalUuid,
  sku: z.string().trim().min(1).max(80),
  barcode: z.string().trim().max(100),
  variantLabel: z.string().trim().max(120),
  sizeSpecification: z.string().trim().max(160),
  unitId: z.uuid(),
  rackLocation: z.string().trim().max(120),
  costPrice: z.number().finite().min(0).max(999999999999.99),
  markedPrice: z.number().finite().min(0).max(999999999999.99),
  defaultSellingPrice: z.number().finite().min(0).max(999999999999.99),
  reorderLevel: z.number().finite().min(0).max(99999999),
  taxRate: z.number().finite().min(0).max(100),
  isActive: z.boolean(),
  priceChangeReason: z.string().trim().max(500),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

export const categoryFormSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(2).max(120),
  parentId: optionalUuid,
  isActive: z.boolean(),
});

export type CategoryFormValues = z.infer<typeof categoryFormSchema>;
