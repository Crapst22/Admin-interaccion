import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BracketForm from "@/components/BracketForm";
import Link from "next/link";

export default async function EditBracketPage({ params }: { params: { id: string } }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: bracket } = await supabase.from("brackets").select("id,name").eq("id", params.id).eq("owner_id", user.id).single();
  if (!bracket) notFound();
  const { data: items } = await supabase.from("items").select("id,name,image_url,position").eq("bracket_id", params.id).order("position");
  return (
    <main className="page-wrap">
      <Link href="/dashboard" className="btn btn-secondary mb-4">← Volver al dashboard</Link>
      <div className="mt-4"><BracketForm bracketId={bracket.id} initialName={bracket.name} initialItems={(items || []).map((i) => ({ id: i.id, name: i.name, image_url: i.image_url }))} /></div>
    </main>
  );
}
