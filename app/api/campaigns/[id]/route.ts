import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, prospects, agents, agentRuns, outreachMessages } from "@/lib/db";
import { eq, and } from "drizzle-orm";

// GET: Campaign detail with prospects + agent info
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const campaignId = parseInt(params.id);

    const campaignRows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id)))
      .limit(1);

    if (campaignRows.length === 0) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    const campaign = campaignRows[0];

    // Get linked agent
    let agent = null;
    if (campaign.agentId) {
      const agentRows = await db.select().from(agents).where(eq(agents.id, campaign.agentId)).limit(1);
      agent = agentRows[0] || null;
    }

    // Get prospects
    const campaignProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.campaignId, campaignId));

    // Get agent runs for this campaign's agent
    let runs: any[] = [];
    if (campaign.agentId) {
      runs = await db
        .select()
        .from(agentRuns)
        .where(and(eq(agentRuns.userId, user.id), eq(agentRuns.agentId, campaign.agentId)))
        .orderBy(agentRuns.createdAt);
      runs = runs.slice(0, 20); // Last 20 runs
    }

    return NextResponse.json({
      campaign,
      agent,
      prospects: campaignProspects,
      runs,
    });
  } catch (error) {
    console.error("Get campaign detail error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH: Update campaign
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const campaignId = parseInt(params.id);
    const body = await req.json();
    const { name, status, agentId, targetCriteria } = body;

    const updateData: any = { updatedAt: new Date() };
    if (name !== undefined) updateData.name = name;
    if (status !== undefined) updateData.status = status;
    if (agentId !== undefined) updateData.agentId = agentId;
    if (targetCriteria !== undefined) updateData.targetCriteria = targetCriteria;

    const [updated] = await db
      .update(campaigns)
      .set(updateData)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }

    return NextResponse.json({ success: true, campaign: updated });
  } catch (error) {
    console.error("Update campaign error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE: Delete campaign (prospects keep existing but lose campaign link)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const campaignId = parseInt(params.id);

    await db.delete(campaigns).where(
      and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id))
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete campaign error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
