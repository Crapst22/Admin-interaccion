import Image from "next/image";
import type { Standing } from "@/lib/bracket";

export default function StandingsTable({ standings }: { standings: Standing[] }) {
  return (
    <div className="card p-4 w-full max-w-xl overflow-auto max-h-[70vh]">
      <h3 className="text-2xl font-bold mb-3">Tabla de posiciones</h3>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="py-2 pr-2">Puesto</th>
            <th className="py-2">Elemento</th>
            <th className="py-2 text-right">Votos</th>
            <th className="py-2 text-right">Llegó hasta</th>
          </tr>
        </thead>
        <tbody>
          {standings.map((s) => (
            <tr key={s.item_id} className="border-t border-slate-700">
              <td className="py-2 pr-2 font-bold text-amber-400">{s.position}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded overflow-hidden bg-slate-700 shrink-0">
                    {s.image_url ? <Image src={s.image_url} alt="" fill className="object-cover" unoptimized /> : null}
                  </div>
                  <span className="font-medium">{s.name}</span>
                </div>
              </td>
              <td className="py-2 text-right font-semibold">{s.total_votes}</td>
              <td className="py-2 text-right text-slate-300">{s.label}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
