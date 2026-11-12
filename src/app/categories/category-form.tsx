"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { saveCategory } from "@/app/products/actions";
import { categoryFormSchema, type CategoryFormValues } from "@/lib/validation/product";

type Option = { id: string; name: string };

export function CategoryForm({ parents, initial }: { parents: Option[]; initial?: CategoryFormValues }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const { register, handleSubmit, formState: { errors } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: initial ?? { id: "", name: "", parentId: "", isActive: true },
  });
  async function submit(values: CategoryFormValues) {
    setSaving(true); setMessage(null);
    try {
      const result = await saveCategory(values);
      setMessage(result.error ?? "Category saved.");
      if (!result.error) router.refresh();
    } catch { setMessage("Category could not be saved."); }
    finally { setSaving(false); }
  }
  const field = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2.5 py-2 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200";
  return <form onSubmit={handleSubmit(submit)} className="grid gap-3 sm:grid-cols-[1fr_1fr_150px_auto]"><input type="hidden" {...register("id")} />
    <label className="text-xs font-medium text-slate-600">Category name<input {...register("name")} maxLength={120} className={field} />{errors.name && <span className="mt-1 block text-xs text-red-700">{errors.name.message}</span>}</label>
    <label className="text-xs font-medium text-slate-600">Parent<select {...register("parentId")} className={field}><option value="">No parent</option>{parents.filter((parent) => parent.id !== initial?.id).map((parent) => <option key={parent.id} value={parent.id}>{parent.name}</option>)}</select></label>
    <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-slate-600"><input type="checkbox" {...register("isActive")} className="size-4 accent-slate-800" />Active</label>
    <button disabled={saving} className="self-end rounded-md bg-slate-800 px-3 py-2 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50">{saving ? "Saving…" : initial?.id ? "Save" : "Add"}</button>
    {message && <p role={message === "Category saved." ? "status" : "alert"} className={`text-xs sm:col-span-4 ${message === "Category saved." ? "text-green-800" : "text-red-800"}`}>{message}</p>}
  </form>;
}
