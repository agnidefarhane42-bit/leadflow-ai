import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, prospects, outreachMessages, agents, agentRuns } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";

// GET: List outreach messages (optionally filtered by campaign)
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");

    let allMessages = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.userId, user.id));

    // Filter by campaign if provided
    let messages = allMessages;
    if (campaignId) {
      // Get prospects for this campaign
      const campaignProspects = await db
        .select()
        .from(prospects)
        .where(and(eq(prospects.campaignId, parseInt(campaignId)), eq(prospects.userId, user.id)));
      const prospectIds = new Set(campaignProspects.map((p) => p.id));
      messages = allMessages.filter((m) => prospectIds.has(m.prospectId));
    }

    return NextResponse.json({ messages });
  } catch (error) {
    console.error("Get outreach messages error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST: Generate an outreach message for a prospect using an agent
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { prospectId, agentId, context } = body;

    if (!prospectId || !agentId) {
      return NextResponse.json({ error: "Prospect ID et Agent ID requis" }, { status: 400 });
    }

    // Get prospect
    const prospectRows = await db
      .select()
      .from(prospects)
      .where(and(eq(prospects.id, prospectId), eq(prospects.userId, user.id)))
      .limit(1);

    if (prospectRows.length === 0) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }
    const prospect = prospectRows[0];
    const prospectData = (prospect.data as Record<string, any>) || {};

    // Get agent
    const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
    if (agentRows.length === 0) {
      return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
    }
    const agent = agentRows[0];

    // Consume credits
    const consumed = await consumeCredits(user.id, agent.creditCost, `Agent: ${agent.name} (outreach message)`);
    if (!consumed) {
      return NextResponse.json(
        { error: "Crédits insuffisants. Achetez plus de crédits pour continuer." },
        { status: 402 }
      );
    }

    // Create agent run
    const [run] = await db
      .insert(agentRuns)
      .values({
        userId: user.id,
        agentId: agent.id,
        input: { prospectId, context },
        creditsConsumed: agent.creditCost,
        status: "running",
      })
      .returning();

    try {
      // Build context about the prospect
      const prospectInfo = [
        `Nom: ${prospect.name}`,
        prospect.email ? `Email: ${prospect.email}` : "",
        prospect.company ? `Entreprise: ${prospect.company}` : "",
        prospectData.role ? `Fonction: ${prospectData.role}` : "",
        prospectData.fitReason ? `Raison du fit: ${prospectData.fitReason}` : "",
        context ? `Contexte supplémentaire: ${context}` : "",
      ].filter(Boolean).join("\n");

      // Determine message type based on agent
      const messageType = agent.slug.includes("linkedin") ? "linkedin" : "email";

      const userMessage = `Génère un message d'outreach personnalisé pour ce prospect:\n\n${prospectInfo}\n\n${
        messageType === "email"
          ? "Réponds au format JSON:\n```json\n{\n  \"subject\": \"Sujet de l'email\",\n  \"body\": \"Corps de l'email\"\n}\n```"
          : "Génère un message LinkedIn de connexion court (max 300 caractères) et un message de suivi. Réponds au format JSON:\n```json\n{\n  \"connectionMessage\": \"Message de connexion\",\n  \"followUpMessage\": \"Message de suivi\"\n}\n```"
      }`;

      const result = await callMistral(
        agent.systemPrompt || "Tu es un expert en outreach B2B.",
        userMessage,
        { temperature: 0.7, maxTokens: 1500 }
      );

      const parsed = parseAIResponse(result.content);

      // Update agent run
      await db
        .update(agentRuns)
        .set({
          output: { content: result.content, parsed: parsed.json, usage: result.usage },
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(agentRuns.id, run.id));

      // Save the outreach message
      let subject = "";
      let content = result.content;

      if (parsed.json) {
        if (parsed.json.subject && parsed.json.body) {
          subject = parsed.json.subject;
          content = parsed.json.body;
        } else if (parsed.json.connectionMessage) {
          subject = "Message de connexion LinkedIn";
          content = parsed.json.connectionMessage + (parsed.json.followUpMessage ? `\n\n--- Message de suivi ---\n${parsed.json.followUpMessage}` : "");
        }
      }

      const [message] = await db
        .insert(outreachMessages)
        .values({
          prospectId: prospect.id,
          userId: user.id,
          type: messageType,
          subject,
          content,
          status: "draft",
        })
        .returning();

      // Update prospect status
      await db
        .update(prospects)
        .set({ status: "contacted", updatedAt: new Date() })
        .where(eq(prospects.id, prospect.id));

      const newBalance = await getBalance(user.id);

      return NextResponse.json({
        success: true,
        message,
        rawContent: result.content,
        parsed: parsed.json,
        creditsConsumed: agent.creditCost,
        balance: newBalance,
      });
    } catch (aiError) {
      // Refund
      const { addCredits } = await import("@/lib/credits");
      await addCredits(user.id, agent.creditCost, `Remboursement: erreur agent ${agent.name}`, String(run.id));

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
    console.error("Generate outreach error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
