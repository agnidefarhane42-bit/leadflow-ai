import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LeadFlow AI — Qualification de leads + RDV automatiques",
  description: "L'agent IA qui qualifie vos leads B2B et prend vos rendez-vous automatiquement. Conçu pour les PME et les développeurs.",
  keywords: ["lead qualification", "AI agent", "appointment booking", "B2B", "SaaS", "PME", "developers"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
