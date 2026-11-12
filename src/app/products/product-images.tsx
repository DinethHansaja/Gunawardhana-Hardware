"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type ImageRow = { id: string; storage_path: string; alt_text: string | null; signed_url: string };

export function ProductImages({ productId, images }: { productId: string; images: ImageRow[] }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [altText, setAltText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function upload() {
    setMessage(null);
    if (!file) { setMessage("Choose a product image first."); return; }
    const extensionByType: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
    const extension = extensionByType[file.type];
    if (!extension || file.size > 5 * 1024 * 1024) { setMessage("Choose a JPEG, PNG, or WebP image up to 5 MB."); return; }
    setBusy(true);
    const supabase = createClient();
    const path = `${productId}/${crypto.randomUUID()}.${extension}`;
    try {
      const { error: uploadError } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) { setMessage("Image upload failed. Check storage setup and your access role."); return; }
      const { error: attachError } = await supabase.rpc("attach_product_image", {
        p_product_id: productId, p_storage_path: path, p_alt_text: altText.trim() || null,
      });
      if (attachError) {
        await supabase.storage.from("product-images").remove([path]);
        setMessage("Image could not be linked to the product.");
        return;
      }
      setFile(null); setAltText(""); setMessage("Image added."); router.refresh();
    } catch {
      setMessage("Image upload failed. Check the database and storage connection.");
    } finally { setBusy(false); }
  }

  async function remove(image: ImageRow) {
    if (!window.confirm("Remove this product image?")) return;
    setBusy(true); setMessage(null);
    try {
      const supabase = createClient();
      const { data: path, error: detachError } = await supabase.rpc("detach_product_image", { p_image_id: image.id });
      if (detachError || !path) { setMessage("Image could not be removed from the product."); return; }
      const { error: storageError } = await supabase.storage.from("product-images").remove([path]);
      if (storageError) setMessage("Image reference removed, but the stored file could not be deleted. Ask an administrator to review storage.");
      else setMessage("Image removed.");
      router.refresh();
    } catch { setMessage("Image could not be removed."); }
    finally { setBusy(false); }
  }

  return <section className="mt-5 rounded-lg border border-slate-200 bg-white p-5 sm:p-6">
    <h2 className="text-sm font-semibold">Product images</h2><p className="mt-1 text-xs text-slate-500">JPEG, PNG, or WebP · up to 5 MB per image · stored in a private Supabase bucket.</p>
    {images.length > 0 && <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{images.map((image) => <div key={image.id} className="overflow-hidden rounded-md border border-slate-200"><a href={image.signed_url} target="_blank" rel="noreferrer"><Image src={image.signed_url} alt={image.alt_text || "Product image"} width={320} height={320} unoptimized className="aspect-square w-full object-cover" /></a><div className="flex items-center justify-between gap-2 p-2"><span className="truncate text-xs text-slate-600">{image.alt_text || "Product image"}</span><button type="button" disabled={busy} onClick={() => void remove(image)} className="shrink-0 text-xs text-red-700 underline underline-offset-4">Remove</button></div></div>)}</div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="text-xs font-medium text-slate-600">Select image<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-xs file:font-medium" /></label><label className="text-xs font-medium text-slate-600">Alternative text<input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={200} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label><button type="button" disabled={busy || !file} onClick={() => void upload()} className="rounded-md bg-slate-800 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Saving…" : "Upload image"}</button></div>
    {message && <p role="status" className="mt-3 text-xs text-slate-600">{message}</p>}
  </section>;
}
