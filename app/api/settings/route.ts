import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// PATCH: Update user profile
export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { fullName, company } = body;

    const updateData: any = { updatedAt: new Date() };
    if (fullName !== undefined) updateData.fullName = fullName;
    if (company !== undefined) updateData.company = company;

    const [updated] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, user.id))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        email: updated.email,
        fullName: updated.fullName,
        company: updated.company,
      },
    });
  } catch (error) {
    console.error("Update settings error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
