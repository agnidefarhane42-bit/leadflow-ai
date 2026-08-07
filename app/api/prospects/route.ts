import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, prospects, campaigns, agents, agentRuns, outreachMessages } from "@/lib/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { consumeCredits, getBalance } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";

// GET: List user's prospects (optionally filtered by campaign)
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const status = searchParams.get("status");

    let query = db.select().from(prospects).where(eq(prospects.userId, user.id));

    if (campaignId) {
      query = db.select().from(prospects).where(
        and(eq(prospects.userId, user.id), eq(prospects.campaignId, parseInt(campaignId)))
      );
    }

    const userProspects = await query.orderBy(desc(prospects.createdAt)).limit(100);

    // Filter by status if provided
    let filtered = userProspects;
    if (status) {
      filtered = userProspects.filter((p) => p.status === status);
    }

    // Get outreach message count per prospect
    const prospectsWithStats = await Promise.all(
      filtered.map(async (p) => {
        const messages = await db
          .select()
          .from(outreachMessages)
          .where(eq(outreachMessages.prospectId, p.id));
        return { ...p, messageCount: messages.length };
      })
    );

    return NextResponse.json({ prospects: prospectsWithStats });
  } catch (error) {
    console.error("Get prospects error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST: Create a prospect manually OR generate prospects via Lead Finder agent
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { mode, campaignId, agentId, criteria } = body;

    // MODE 1: Manual prospect creation
    if (mode === "manual" || (!mode && body.name)) {
      const { name, email, company, phone, linkedinUrl } = body;
      if (!name) {
        return NextResponse.json({ error: "Nom requis" }, { status: 400 });
      }

      const [prospect] = await db
        .insert(prospects)
        .values({
          userId: user.id,
          campaignId: campaignId || null,
          name,
          email: email || null,
          company: company || null,
          phone: phone || null,
          linkedinUrl: linkedinUrl || null,
          source: "manual",
        })
        .returning();

      return NextResponse.json({ success: true, prospect });
    }

    // MODE 2: Generate prospects via Lead Finder agent
    if (mode === "generate") {
      if (!agentId) {
        return NextResponse.json({ error: "Agent ID requis" }, { status: 400 });
      }

      // Get agent details
      const agentRows = await db.select().from(agents).where(eq(agents.id, agentId)).limit(1);
      if (agentRows.length === 0) {
        return NextResponse.json({ error: "Agent introuvable" }, { status: 404 });
      }
      const agent = agentRows[0];

      // Consume credits
      const consumed = await consumeCredits(user.id, agent.creditCost, `Agent: ${agent.name} (génération prospects)`);
      if (!consumed) {
        return NextResponse.json(
          { error: "Crédits insuffisants. Achetez plus de crédits pour continuer." },
          { status: 402 }
        );
      }

      // Create agent run record
      const [run] = await db
        .insert(agentRuns)
        .values({
          userId: user.id,
          agentId: agent.id,
          input: { criteria, campaignId },
          creditsConsumed: agent.creditCost,
          status: "running",
        })
        .returning();

      try {
        // Build the prompt for Mistral — ask for structured JSON output
        const criteriaStr = criteria
          ? Object.entries(criteria)
              .map(([k, v]) => `- ${k}: ${v}`)
              .join("\n")
          : "Aucun critère spécifique";

        const userMessage = `Génère une liste de 5 prospects B2B potentiels basés sur ces critères:\n\n${criteriaStr}\n\nRéponds UNIQUEMENT au format JSON avec cette structure exacte:\n\`\`\`json\n{\n  "prospects": [\n    {\n      "name": "Nom complet",\n      "email": "email@exemple.com",\n      "company": "Nom de l'entreprise",\n      "role": "Fonction/Poste",\n      "linkedinUrl": "",\n      "fitScore": 85,\n      "fitReason": "Pourquoi ce prospect est intéressant"\n    }\n  ]\n}\n\`\`\``;

        const result = await callMistral(
          agent.systemPrompt || "Tu es un expert en lead generation B2B.",
          userMessage,
          { temperature: 0.8, maxTokens: 2000 }
        );

        const parsed = parseAIResponse(result.content);

        // Update run record
        await db
          .update(agentRuns)
          .set({
            output: { content: result.content, parsed: parsed.json, usage: result.usage },
            status: "completed",
            completedAt: new Date(),
          })
          .where(eq(agentRuns.id, run.id));

        // If we got structured prospects, save them to the database
        let savedProspects: any[] = [];
        if (parsed.json?.prospects && Array.isArray(parsed.json.prospects)) {
          for (const p of parsed.json.prospects) {
            const [saved] = await db
              .insert(prospects)
              .values({
                userId: user.id,
                campaignId: campaignId || null,
                name: p.name || "Inconnu",
                email: p.email || null,
                company: p.company || null,
                linkedinUrl: p.linkedinUrl || null,
                source: "agent",
                score: p.fitScore || 0,
                status: "new",
                data: { role: p.role, fitReason: p.fitReason },
              })
              .returning();
            savedProspects.push(saved);
          }
        }

        const newBalance = await getBalance(user.id);

        return NextResponse.json({
          success: true,
          runId: run.id,
          rawContent: result.content,
          parsed: parsed.json,
          savedProspects,
          creditsConsumed: agent.creditCost,
          balance: newBalance,
        });
      } catch (aiError) {
        // Refund credits
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
    }

    return NextResponse.json({ error: "Mode non reconnu" }, { status: 400 });
  } catch (error) {
    console.error("Create prospect error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
