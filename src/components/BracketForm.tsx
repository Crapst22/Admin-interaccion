"use client";
import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { EXAMPLE_ITEMS, exampleImageUrl } from "@/lib/example";

type FormItem = { id?: string; name: string; image_url: string; file?: File; preview?: string };

async function compressImage(file: File, max = 800): Promise<File> {
  const img = document.createElement("img");
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d")!; ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob: Blob = await new Promise(r => canvas.toBlob(b => r(b!), "image/jpeg", 0.82));
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export default function BracketForm({ initialName = "", initialItems = [], bracketId }: { initialName?: string; initialItems?: FormItem[]; bracketId?: string }) {
  const [name, setName] = useState(initialName);
  const [items, setItems] = useState<FormItem[]>(initialItems.length ? initialItems : [{ name: "", image_url: "" }, { name: "", image_url: "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function addItem() { setItems([...items, { name: "", image_url: "" }]); }
  function removeItem(i: number) { if (items.length <= 2) return; setItems(items.filter((_, idx) => idx !== i)); }
  function update(i: number, patch: Partial<FormItem>) { setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }

  async function onFile(i: number, file?: File) {
    if (!file) return;
    const compressed = await compressImage(file);
    const preview = URL.createObjectURL(compressed);
    update(i, { file: compressed, preview });
  }

  function loadExample() {
    setName("Riesgos de administración");
    setItems(EXAMPLE_ITEMS.map((n, i) => ({ name: n, image_url: exampleImageUrl(n, i) })));
  }

  async function save() {
    setError(null);
    if (!name.trim()) return setError("Ingresá un nombre para la llave.");
    if (items.length < 2) return setError("Agregá al menos 2 elementos.");
    if (items.some(it => !it.name.trim() || (!it.image_url && !it.file))) return setError("Cada elemento debe tener nombre e imagen.");
    setSaving(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError("Sesión expirada."); setSaving(false); return; }

    let bid = bracketId;
    if (bid) {
      await supabase.from("brackets").update({ name }).eq("id", bid);
      // reemplazo simple: borrar items y recrear
      await supabase.from("items").delete().eq("bracket_id", bid);
    } else {
      const { data, error } = await supabase.from("brackets").insert({ name, owner_id: user.id }).select("id").single();
      if (error || !data) { setError(error?.message || "Error al crear"); setSaving(false); return; }
      bid = data.id;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let image_url = it.image_url;
      if (it.file) {
        const path = `${user.id}/${bid}/${crypto.randomUUID()}.jpg`;
        const { error: upErr } = await supabase.storage.from("images").upload(path, it.file, { contentType: "image/jpeg", upsert: true });
        if (upErr) { setError(upErr.message); setSaving(false); return; }
        const { data } = supabase.storage.from("images").getPublicUrl(path);
        image_url = data.publicUrl;
      }
      const { error: insErr } = await supabase.from("items").insert({ bracket_id: bid, name: it.name.trim(), image_url, position: i });
      if (insErr) { setError(insErr.message); setSaving(false); return; }
    }
    router.push("/dashboard"); router.refresh();
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-3xl font-bold">{bracketId ? "Editar llave" : "Nueva llave"}</h1>
        <button type="button" onClick={loadExample} className="btn btn-secondary text-sm">Cargar ejemplo</button>
      </div>
      <div><label>Nombre de la llave</label><input className="input mt-1" value={name} onChange={e=>setName(e.target.value)} placeholder="Ej: Riesgos de administración" /></div>
      <div className="space-y-4">
        {items.map((it, i) => (
          <div key={i} className="card p-4 flex flex-col sm:flex-row gap-4 items-start">
            <div className="w-28 h-28 bg-slate-900 rounded-lg overflow-hidden flex items-center justify-center shrink-0 relative">
              {(it.preview || it.image_url) ? <Image src={it.preview || it.image_url} alt="" fill className="object-cover" unoptimized /> : <span className="text-slate-500 text-xs text-center px-2">Sin imagen</span>}
            </div>
            <div className="flex-1 space-y-2 w-full">
              <div><label>Nombre del elemento</label><input className="input mt-1" value={it.name} onChange={e=>update(i,{name:e.target.value})} /></div>
              <div><label>Imagen</label><input className="mt-1 text-sm" type="file" accept="image/*" onChange={e=>onFile(i, e.target.files?.[0])} /></div>
            </div>
            <button type="button" onClick={()=>removeItem(i)} disabled={items.length<=2} className="btn btn-danger text-sm">Eliminar</button>
          </div>
        ))}
      </div>
      {error && <p className="text-rose-400">{error}</p>}
      <div className="flex gap-3">
        <button type="button" onClick={addItem} className="btn btn-secondary">Agregar elemento</button>
        <button type="button" onClick={save} disabled={saving} className="btn btn-primary">{saving ? "Guardando..." : "Guardar llave"}</button>
      </div>
    </div>
  );
}
