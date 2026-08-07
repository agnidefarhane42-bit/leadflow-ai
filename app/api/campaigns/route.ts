import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, agents, prospects, agentRuns } from "@/lib/db";
import { eq, desc } from "drizzle-orm";

// GET: List user's campaigns
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, user.id))
      .orderBy(desc(campaigns.createdAt));

    // Get prospect count for each campaign
    const campsWithStats = await Promise.all(
      userCampaigns.map(async (camp) => {
        const prospectCount = await db
          .select()
          .from(prospects)
          .where(eq(prospects.campaignId, camp.id));
        return { ...camp, prospectCount: prospectCount.length };
      })
    );

    return NextResponse.json({ campaigns: campsWithStats });
  } catch (error) {
    console.error("Get campaigns error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST: Create a new campaign
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { name, agentId, targetCriteria } = body;

    if (!name) {
      return NextResponse.json({ error: "Nom de campagne requis" }, { status: 400 });
    }

    // Validate agent if provided
    if (agentId) {
      const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      if (agentRows.length === 0) {
        return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
      }
    }

    const [campaign] = await db
      .insert(campaigns)
      .values({
        userId: user.id,
        name,
        agentId: agentId || null,
        targetCriteria: targetCriteria || null,
        status: "draft",
      })
      .returning();

    return NextResponse.json({ success: true, campaign });
  } catch (error) {
    console.error("Create campaign error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
