import Image from "next/image";
import type { ClassificationResult } from "@/lib/bracket";
import { levelLabel } from "@/lib/bracket";

const rowClass: Record<string, string> = {
  high: "bg-red-500/15 border-red-500/40",
  medium: "bg-orange-500/15 border-orange-500/40",
  low: "bg-yellow-400/15 border-yellow-400/40",
};
const badgeClass: Record<string, string> = {
  high: "bg-red-500 text-white",
  medium: "bg-orange-500 text-white",
  low: "bg-yellow-400 text-slate-900",
};

export default function StandingsTable({ results }: { results: ClassificationResult[] }) {
  return (
    <div className="card p-4 w-full max-w-3xl overflow-auto max-h-[75vh]">
      <h3 className="text-2xl font-bold mb-3">Resultados de clasificación</h3>
      <table className="w-full text-left text-sm">
        <thead className="text-slate-400">
          <tr>
            <th className="py-2 pr-2">#</th>
            <th className="py-2">Riesgo</th>
            <th className="py-2 text-center">Nivel</th>
            <th className="py-2 text-right">Alta</th>
            <th className="py-2 text-right">Media</th>
            <th className="py-2 text-right">Baja</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.item_id} className={`border-t ${rowClass[r.level]}`}>
              <td className="py-2 pr-2 font-bold text-slate-300">{r.position}</td>
              <td className="py-2">
                <div className="flex items-center gap-2">
                  <div className="relative w-8 h-8 rounded overflow-hidden bg-slate-700 shrink-0">
                    {r.image_url ? <Image src={r.image_url} alt="" fill className="object-contain" unoptimized /> : null}
                  </div>
                  <span className="font-medium">{r.name}</span>
                </div>
              </td>
              <td className="py-2 text-center">
                <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${badgeClass[r.level]}`}>{levelLabel(r.level)}</span>
              </td>
              <td className="py-2 text-right font-semibold text-red-400">{r.votes_high}</td>
              <td className="py-2 text-right font-semibold text-orange-400">{r.votes_medium}</td>
              <td className="py-2 text-right font-semibold text-yellow-300">{r.votes_low}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}