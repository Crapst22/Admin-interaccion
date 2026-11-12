"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function AuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault(); setError(null); setLoading(true);
    const supabase = createClient();
    const fn = mode === "login" ? supabase.auth.signInWithPassword : supabase.auth.signUp;
    const { error } = await fn({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/dashboard"); router.refresh();
  }

  return (
    <div className="w-full max-w-md card p-8 shadow-xl">
      <h1 className="text-3xl font-bold mb-2 text-center">Torneo de Riesgos</h1>
      <p className="text-slate-400 text-center mb-6">{mode === "login" ? "Iniciá sesión" : "Creá tu cuenta"}</p>
      <form onSubmit={onSubmit} className="space-y-4">
        <div><label>Correo electrónico</label><input className="input mt-1" type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div><label>Contraseña</label><input className="input mt-1" type="password" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} /></div>
        {error && <p className="text-rose-400 text-sm">{error}</p>}
        <button className="btn btn-primary w-full" disabled={loading}>{loading ? "Cargando..." : mode === "login" ? "Ingresar" : "Registrarme"}</button>
      </form>
      <button className="mt-4 w-full text-sm text-amber-400 hover:underline" onClick={()=>setMode(m=>m==="login"?"register":"login")}>
        {mode === "login" ? "¿No tenés cuenta? Registrate" : "¿Ya tenés cuenta? Iniciá sesión"}
      </button>
    </div>
  );
}
