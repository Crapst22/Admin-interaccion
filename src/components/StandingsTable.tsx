import { Standing } from "@/types/db";
import Image from "next/image";

export default function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="card p-4 w-full max-w-md overflow-auto max-h-[70vh]">
      <h3 className="text-2xl font-bold mb-3">Tabla de posiciones</h3>
      <table className="w-full text-left">
        <thead className="text-slate-400 text-sm"><tr><th className="py-1">#</th><th>Elemento</th><th className="text-right">Votos</th></tr></thead>
        <tbody>
          {standings.map((s, i) => (
            <tr key={s.item_id} className="border-t border-slate-700">
              <td className="py-2 font-bold text-amber-400">{i + 1}</td>
              <td className="py-2 flex items-center gap-2"><div className="relative w-8 h-8 rounded overflow-hidden bg-slate-700"><Image src={s.image_url} alt="" fill className="object-cover" unoptimized /></div><span>{s.name}</span></td>
              <td className="py-2 text-right font-semibold">{s.total_votes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
