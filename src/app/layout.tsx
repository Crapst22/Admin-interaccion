import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Torneo de Riesgos",
  description: "Votación en llaves para exposición sobre riesgos de administración",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
