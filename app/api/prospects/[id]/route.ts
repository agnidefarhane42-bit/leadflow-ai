import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, prospects, outreachMessages, agents, agentRuns } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";

// GET: Prospect detail with outreach messages
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const prospectId = parseInt(params.id);

    const prospectRows = await db
      .select()
      .from(prospects)
      .where(and(eq(prospects.id, prospectId), eq(prospects.userId, user.id)))
      .limit(1);

    if (prospectRows.length === 0) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }

    const messages = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.prospectId, prospectId));

    return NextResponse.json({
      prospect: prospectRows[0],
      messages,
    });
  } catch (error) {
    console.error("Get prospect error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH: Update prospect status
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const prospectId = parseInt(params.id);
    const body = await req.json();
    const { status, score } = body;

    const updateData: any = { updatedAt: new Date() };
    if (status !== undefined) updateData.status = status;
    if (score !== undefined) updateData.score = score;

    const [updated] = await db
      .update(prospects)
      .set(updateData)
      .where(and(eq(prospects.id, prospectId), eq(prospects.userId, user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, prospect: updated });
  } catch (error) {
    console.error("Update prospect error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE: Delete a prospect
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const prospectId = parseInt(params.id);

    await db.delete(prospects).where(
      and(eq(prospects.id, prospectId), eq(prospects.userId, user.id))
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete prospect error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
