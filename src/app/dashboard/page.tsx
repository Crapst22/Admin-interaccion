import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function deleteBracket(formData: FormData) {
  "use server";
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("brackets").delete().eq("id", id);
  revalidatePath("/dashboard");
}

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: brackets } = await supabase.from("brackets").select("id,name,created_at,items(count)").eq("owner_id", user.id).order("created_at", { ascending: false });

  return (
    <main className="min-h-screen p-6 md:p-10 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div><h1 className="text-4xl font-extrabold">Mis llaves</h1><p className="text-slate-400">{user.email}</p></div>
        <form action={signOut}><button className="btn btn-secondary">Salir</button></form>
      </header>
      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Link href="/brackets/new" className="card flex flex-col items-center justify-center min-h-[180px] border-dashed border-2 border-amber-500/60 hover:bg-slate-800 transition">
          <span className="text-6xl text-amber-400 leading-none">+</span>
          <span className="mt-2 font-semibold">Crear nueva llave</span>
        </Link>
        {(brackets || []).map((b: { id: string; name: string; items: { count: number }[] }) => (
          <div key={b.id} className="card p-5 flex flex-col justify-between min-h-[180px]">
            <div>
              <h2 className="text-xl font-bold">{b.name}</h2>
              <p className="text-slate-400">{b.items?.[0]?.count ?? 0} elementos</p>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Link href={`/brackets/${b.id}/host`} className="btn btn-primary text-sm">Iniciar votación</Link>
              <Link href={`/brackets/${b.id}/edit`} className="btn btn-secondary text-sm">Editar</Link>
              <form action={deleteBracket}><input type="hidden" name="id" value={b.id} /><button className="btn btn-danger text-sm" type="submit">Eliminar</button></form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
