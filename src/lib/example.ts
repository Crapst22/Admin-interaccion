export const EXAMPLE_ITEMS = [
  "Riesgo financiero", "Riesgo operativo", "Riesgo estratégico", "Riesgo legal",
  "Riesgo reputacional", "Riesgo tecnológico", "Riesgo de mercado", "Riesgo de talento",
];

// Genera un SVG data URL simple como imagen de ejemplo
export function exampleImageUrl(name: string, index: number) {
  const colors = ["#0f766e","#b45309","#1d4ed8","#b91c1c","#7c3aed","#047857","#c2410c","#334155"];
  const bg = colors[index % colors.length];
  const initials = name.split(" ").map(w=>w[0]).join("").slice(0,3).toUpperCase();
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'><rect width='100%' height='100%' fill='${bg}'/><text x='50%' y='50%' dominant-baseline='middle' text-anchor='middle' font-family='Arial' font-size='96' fill='white'>${initials}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
