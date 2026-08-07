import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, prospects } from "@/lib/db";
import { eq } from "drizzle-orm";

// GET: Export prospects as CSV
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");

    let query = db.select().from(prospects).where(eq(prospects.userId, user.id));
    if (campaignId) {
      // Re-query with campaign filter
      const { and } = await import("drizzle-orm");
      query = db.select().from(prospects).where(
        and(eq(prospects.userId, user.id), eq(prospects.campaignId, parseInt(campaignId)))
      );
    }

    const userProspects = await query.orderBy(prospects.createdAt);

    // Build CSV
    const headers = ["Nom", "Email", "Entreprise", "Téléphone", "LinkedIn", "Score", "Statut", "Source", "Créé le"];

    const rows = userProspects.map((p) => {
      const data = p.data as Record<string, any> | null;
      return [
        p.name,
        p.email || "",
        p.company || "",
        p.phone || "",
        p.linkedinUrl || "",
        p.score?.toString() || "0",
        p.status || "",
        p.source || "",
        new Date(p.createdAt || new Date()).toISOString().split("T")[0],
      ];
    });

    // Escape CSV values (wrap in quotes if contains comma or quote)
    const escapeCSV = (val: string) => {
      if (val.includes(",") || val.includes('"') || val.includes("\n")) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const csv = [
      headers.map(escapeCSV).join(","),
      ...rows.map((row) => row.map(escapeCSV).join(",")),
    ].join("\n");

    // Add BOM for Excel UTF-8 support
    const csvWithBOM = "\uFEFF" + csv;

    return new NextResponse(csvWithBOM, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prospects_${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    console.error("CSV export error:", error);
    return NextResponse.json({ error: "Erreur lors de l'export" }, { status: 500 });
  }
}
