import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, requireAdmin } from "@/lib/auth";
import { db, users, campaigns, prospects, outreachMessages, agents, agentRuns, creditBalances, creditTransactions, leads } from "@/lib/db";
import { eq, sql, desc } from "drizzle-orm";

// GET: Full admin dashboard data
export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Accès refusé — admin uniquement" }, { status: 403 });
    }

    // Fetch ALL data
    const [
      allUsers,
      allCampaigns,
      allProspects,
      allMessages,
      allAgents,
      allAgentRuns,
      allBalances,
      allTransactions,
      allLeads,
    ] = await Promise.all([
      db.select().from(users),
      db.select().from(campaigns),
      db.select().from(prospects),
      db.select().from(outreachMessages),
      db.select().from(agents),
      db.select().from(agentRuns).orderBy(desc(agentRuns.createdAt)).limit(50),
      db.select().from(creditBalances),
      db.select().from(creditTransactions).orderBy(desc(creditTransactions.createdAt)).limit(50),
      db.select().from(leads),
    ]);

    // Calculate stats
    const totalUsers = allUsers.length;
    const totalCampaigns = allCampaigns.length;
    const totalProspects = allProspects.length;
    const totalMessages = allMessages.length;
    const sentMessages = allMessages.filter((m) => m.status === "sent").length;
    const draftMessages = allMessages.filter((m) => m.status === "draft").length;
    const bouncedMessages = allMessages.filter((m) => m.status === "bounced").length;
    const totalAgentRuns = allAgentRuns.length;
    const totalLeads = allLeads.length;

    // Credit stats
    const totalCreditsInSystem = allBalances.reduce((sum, b) => sum + b.balance, 0);
    const creditsSpent = allTransactions
      .filter((t) => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const creditsPurchased = allTransactions
      .filter((t) => t.type === "purchase" && t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);

    // User plan breakdown
    const planBreakdown = {
      free: allUsers.filter((u) => (u.plan || "free") === "free").length,
      pro: allUsers.filter((u) => u.plan === "pro").length,
      enterprise: allUsers.filter((u) => u.plan === "enterprise").length,
    };

    // Agent usage stats
    const agentStats = allAgents.map((agent) => {
      const runs = allAgentRuns.filter((r) => r.agentId === agent.id);
      return {
        id: agent.id,
        name: agent.name,
        slug: agent.slug,
        creditCost: agent.creditCost,
        totalRuns: runs.length,
        successful: runs.filter((r) => r.status === "completed").length,
        failed: runs.filter((r) => r.status === "failed").length,
      };
    });

    // Recent signups (last 5)
    const recentUsers = allUsers
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 10)
      .map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        company: u.company,
        role: u.role,
        plan: u.plan,
        createdAt: u.createdAt,
      }));

    // Revenue estimate (each pro user = €20/month)
    const estimatedMonthlyRevenue = planBreakdown.pro * 20;

    return NextResponse.json({
      stats: {
        totalUsers,
        totalCampaigns,
        totalProspects,
        totalMessages,
        sentMessages,
        draftMessages,
        bouncedMessages,
        totalAgentRuns,
        totalLeads,
        totalCreditsInSystem,
        creditsSpent,
        creditsPurchased,
        planBreakdown,
        estimatedMonthlyRevenue,
      },
      users: recentUsers,
      campaigns: allCampaigns.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        userId: c.userId,
        createdAt: c.createdAt,
      })),
      agents: agentStats,
      recentTransactions: allTransactions.map((t) => ({
        id: t.id,
        userId: t.userId,
        amount: t.amount,
        type: t.type,
        description: t.description,
        createdAt: t.createdAt,
      })),
      recentAgentRuns: allAgentRuns.map((r) => ({
        id: r.id,
        userId: r.userId,
        agentId: r.agentId,
        status: r.status,
        creditsConsumed: r.creditsConsumed,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
