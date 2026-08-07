import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, prospects, campaigns, outreachMessages, agentRuns, creditTransactions, agents } from "@/lib/db";
import { eq, and, sql, desc, gte, lte, count } from "drizzle-orm";

// GET: Analytics dashboard data
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // 1. Prospect funnel
    const allProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.userId, user.id));

    const funnel = {
      total: allProspects.length,
      new: allProspects.filter((p) => p.status === "new").length,
      qualified: allProspects.filter((p) => p.status === "qualified").length,
      contacted: allProspects.filter((p) => p.status === "contacted").length,
      replied: allProspects.filter((p) => p.status === "replied").length,
      won: allProspects.filter((p) => p.status === "won").length,
      lost: allProspects.filter((p) => p.status === "lost").length,
    };

    // 2. Conversion rates
    const conversionRates = {
      newToQualified: funnel.total > 0 ? Math.round((funnel.qualified / funnel.total) * 100) : 0,
      qualifiedToContacted: funnel.qualified > 0 ? Math.round((funnel.contacted / funnel.qualified) * 100) : 0,
      contactedToReplied: funnel.contacted > 0 ? Math.round((funnel.replied / funnel.contacted) * 100) : 0,
      repliedToWon: funnel.replied > 0 ? Math.round((funnel.won / funnel.replied) * 100) : 0,
      overallWinRate: funnel.total > 0 ? Math.round((funnel.won / funnel.total) * 100) : 0,
    };

    // 3. Outreach stats
    const allMessages = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.userId, user.id));

    const outreachStats = {
      total: allMessages.length,
      draft: allMessages.filter((m) => m.status === "draft").length,
      sent: allMessages.filter((m) => m.status === "sent").length,
      replied: allMessages.filter((m) => m.status === "replied").length,
      bounced: allMessages.filter((m) => m.status === "bounced").length,
      responseRate: allMessages.filter((m) => m.status === "sent").length > 0
        ? Math.round((allMessages.filter((m) => m.status === "replied").length / allMessages.filter((m) => m.status === "sent").length) * 100)
        : 0,
    };

    // 4. Agent usage
    const allRuns = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.userId, user.id));

    const agentUsageMap = new Map<number, { count: number; credits: number; successCount: number }>();
    for (const run of allRuns) {
      const existing = agentUsageMap.get(run.agentId) || { count: 0, credits: 0, successCount: 0 };
      existing.count++;
      existing.credits += run.creditsConsumed;
      if (run.status === "completed") existing.successCount++;
      agentUsageMap.set(run.agentId, existing);
    }

    // Get agent names
    const allAgents = await db.select().from(agents);
    const agentUsage = Array.from(agentUsageMap.entries()).map(([agentId, stats]) => {
      const agent = allAgents.find((a) => a.id === agentId);
      return {
        agentId,
        agentName: agent?.name || "Inconnu",
        agentSlug: agent?.slug || "",
        runs: stats.count,
        credits: stats.credits,
        successRate: stats.count > 0 ? Math.round((stats.successCount / stats.count) * 100) : 0,
      };
    }).sort((a, b) => b.runs - a.runs);

    // 5. Credit usage over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentTransactions = await db
      .select()
      .from(creditTransactions)
      .where(and(eq(creditTransactions.userId, user.id), gte(creditTransactions.createdAt, thirtyDaysAgo)));

    // Group by day
    const creditTrend: { date: string; earned: number; spent: number }[] = [];
    const trendMap = new Map<string, { earned: number; spent: number }>();

    for (const tx of recentTransactions) {
      const date = new Date(tx.createdAt || new Date()).toISOString().split("T")[0];
      const existing = trendMap.get(date) || { earned: 0, spent: 0 };
      if (tx.amount > 0) existing.earned += tx.amount;
      else existing.spent += Math.abs(tx.amount);
      trendMap.set(date, existing);
    }

    // Fill in missing days
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split("T")[0];
      creditTrend.push({
        date: dateStr,
        earned: trendMap.get(dateStr)?.earned || 0,
        spent: trendMap.get(dateStr)?.spent || 0,
      });
    }

    // 6. Campaign performance
    const allCampaigns = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.userId, user.id));

    const campaignPerformance = await Promise.all(
      allCampaigns.map(async (camp) => {
        const campProspects = allProspects.filter((p) => p.campaignId === camp.id);
        return {
          id: camp.id,
          name: camp.name,
          status: camp.status,
          prospectCount: campProspects.length,
          contacted: campProspects.filter((p) => p.status === "contacted").length,
          replied: campProspects.filter((p) => p.status === "replied").length,
          won: campProspects.filter((p) => p.status === "won").length,
          winRate: campProspects.length > 0 ? Math.round((campProspects.filter((p) => p.status === "won").length / campProspects.length) * 100) : 0,
        };
      })
    );

    // 7. Summary stats
    const totalCreditsSpent = allRuns.reduce((sum, r) => sum + r.creditsConsumed, 0);
    const totalCreditsEarned = recentTransactions
      .filter((t) => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    return NextResponse.json({
      funnel,
      conversionRates,
      outreachStats,
      agentUsage,
      creditTrend,
      campaignPerformance,
      summary: {
        totalProspects: funnel.total,
        totalMessages: outreachStats.total,
        totalCreditsSpent,
        totalAgentRuns: allRuns.length,
        activeCampaigns: allCampaigns.filter((c) => c.status === "active").length,
        avgScore: allProspects.length > 0
          ? Math.round(allProspects.reduce((sum, p) => sum + (p.score || 0), 0) / allProspects.length)
          : 0,
      },
    });
  } catch (error) {
    console.error("Analytics error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
