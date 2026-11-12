import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BracketForm from "@/components/BracketForm";
import Link from "next/link";

export default async function NewBracketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="min-h-screen p-6 md:p-10">
      <Link href="/dashboard" className="text-amber-400 hover:underline">← Volver</Link>
      <div className="mt-4"><BracketForm /></div>
    </main>
  );
}
