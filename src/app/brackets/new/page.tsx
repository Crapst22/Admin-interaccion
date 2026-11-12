import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BracketForm from "@/components/BracketForm";
import Link from "next/link";

export default async function NewBracketPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return (
    <main className="page-wrap">
      <Link href="/dashboard" className="btn btn-secondary mb-4">← Volver al dashboard</Link>
      <div className="mt-4"><BracketForm /></div>
    </main>
  );
}
