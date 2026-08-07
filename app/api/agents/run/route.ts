import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, agents, agentRuns } from "@/lib/db";
import { eq } from "drizzle-orm";
import { consumeCredits, getBalance } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";

// GET: List all active agents
export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const allAgents = await db
      .select()
      .from(agents)
      .where(eq(agents.isActive, true))
      .orderBy(agents.sortOrder);

    const balance = await getBalance(user.id);

    return NextResponse.json({ agents: allAgents, balance });
  } catch (error) {
    console.error("Get agents error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST: Run an agent
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { agentId, input } = body;

    if (!agentId) {
      return NextResponse.json({ error: "Agent ID requis" }, { status: 400 });
    }

    // Get agent details
    const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (agentRows.length === 0) {
      return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    }

    const agent = agentRows[0];

    // Check and consume credits
    const consumed = await consumeCredits(
      user.id,
      agent.creditCost,
      `Agent: ${agent.name}`,
    );

    if (!consumed) {
      return NextResponse.json(
        { error: "Crédits insuffisants. Achetez plus de crédits pour continuer." },
        { status: 402 }
      );
    }

    // Create agent run record (status: running)
    const [run] = await db
      .insert(agentRuns)
      .values({
        userId: user.id,
        agentId: agent.id,
        input: input || null,
        creditsConsumed: agent.creditCost,
        status: "running",
      })
      .returning();

    try {
      // Build the user message from input
      const userMessage = typeof input === "string" ? input : JSON.stringify(input, null, 2);

      // Call Mistral AI
      const result = await callMistral(
        agent.systemPrompt || "Tu es un assistant IA utile.",
        userMessage,
        { temperature: 0.7, maxTokens: 2000 }
      );

      const parsed = parseAIResponse(result.content);

      // Update run record with result
      await db
        .update(agentRuns)
        .set({
          output: { content: result.content, parsed: parsed.json, usage: result.usage },
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));

      // Get updated balance
      const newBalance = await getBalance(user.id);

      return NextResponse.json({
        success: true,
        runId: run.id,
        content: result.content,
        parsed: parsed.json,
        usage: result.usage,
        creditsConsumed: agent.creditCost,
        balance: newBalance,
      });
    } catch (aiError) {
      // Refund credits on AI failure
      const { addCredits } = await import("@/lib/credits");
      await addCredits(user.id, agent.creditCost, `Remboursement: erreur agent ${agent.name}`, String(run.id));

      // Update run record with error
      await db
        .update(agentRuns)
        .set({
          status: "failed",
          error: aiError instanceof Error ? aiError.message : "Erreur inconnue",
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));

      return NextResponse.json(
        { error: "L'agent a rencontré une erreur. Vos crédits ont été remboursés." },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("Run agent error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
