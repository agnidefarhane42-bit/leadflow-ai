import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, prospects, agents, agentRuns, outreachMessages } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance, addCredits } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";
import { sendEmail } from "@/lib/resend";

// POST: Run a campaign step (or full pipeline)
// Body: { step: "find" | "qualify" | "generate" | "send" | "all" }
export async function POST(
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
    const step = body.step || "all";

    // Get campaign
    const campaignRows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id)))
      .limit(1);

    if (campaignRows.length === 0) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    const campaign = campaignRows[0];

    // Get all agents
    const allAgents = await db.select().from(agents).where(eq(agents.isActive, true));
    const leadFinder = allAgents.find((a) => a.slug === "lead-finder");
    const qualifier = allAgents.find((a) => a.slug === "prospect-qualifier");
    const emailWriter = allAgents.find((a) => a.slug === "cold-email-writer");

    // ============================================
    // STEP 1: FIND — Generate prospects via Lead Finder
    // ============================================
    if (step === "find" || step === "all") {
      const findResult = await runFindStep(user.id, campaignId, campaign, leadFinder);
      if (findResult.error) return findResult.response;
      if (step === "find") return findResult.response;
    }

    // ============================================
    // STEP 2: QUALIFY — Score all unqualified prospects
    // ============================================
    if (step === "qualify" || step === "all") {
      const qualifyResult = await runQualifyStep(user.id, campaignId, qualifier);
      if (qualifyResult.error) return qualifyResult.response;
      if (step === "qualify") return qualifyResult.response;
    }

    // ============================================
    // STEP 3: GENERATE — Create outreach messages for qualified prospects
    // ============================================
    if (step === "generate" || step === "all") {
      const genResult = await runGenerateStep(user.id, campaignId, emailWriter);
      if (genResult.error) return genResult.response;
      if (step === "generate") return genResult.response;
    }

    // ============================================
    // STEP 4: SEND — Send all draft emails
    // ============================================
    if (step === "send") {
      return await runSendStep(user.id, campaignId);
    }

    // If "all" and we get here, everything succeeded
    // Get final stats
    const finalProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.campaignId, campaignId));

    const draftMessages = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.userId, user.id));

    const balance = await getBalance(user.id);

    return NextResponse.json({
      success: true,
      step: "all",
      stats: {
        totalProspects: finalProspects.length,
        qualified: finalProspects.filter((p) => p.status === "qualified" || p.score >= 50).length,
        hot: finalProspects.filter((p) => p.score >= 70).length,
        draftMessages: draftMessages.filter((m) => m.status === "draft").length,
      },
      balance,
      nextStep: "send",
      message: "Pipeline terminé ! Vérifiez les messages et envoyez-les.",
    });
  } catch (error) {
    console.error("Campaign run error:", error);
    return NextResponse.json({ error: "Erreur serveur lors de l'exécution" }, { status: 500 });
  }
}

// ============================================
// STEP FUNCTIONS
// ============================================

async function runFindStep(userId: number, campaignId: number, campaign: any, agent: any) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Lead Finder introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  // Consume credits
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants. Achetez plus de crédits pour continuer." },
      { status: 402 }
    );
    return { error: true, response: res };
  }

  // Log agent run
  const [run] = await db.insert(agentRuns).values({
    userId,
    agentId: agent.id,
    input: { campaignId, criteria: campaign.targetCriteria },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};
    const criteriaStr = Object.entries(criteria)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n") || "Aucun critère spécifique (génère des prospects B2B généraux)";

    const userMessage = `Génère une liste de 8 prospects B2B potentiels basés sur ces critères:\n\n${criteriaStr}\n\nRéponds UNIQUEMENT au format JSON:\n\`\`\`json\n{\n  "prospects": [\n    {\n      "name": "Nom complet",\n      "email": "email@exemple.com",\n      "company": "Nom de l'entreprise",\n      "role": "Fonction/Poste",\n      "linkedinUrl": "",\n      "fitScore": 85,\n      "fitReason": "Pourquoi ce prospect est intéressant"\n    }\n  ]\n}\n\`\`\``;

    const result = await callMistral(agent.systemPrompt, userMessage, {
      temperature: 0.8,
      maxTokens: 2500,
    });

    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json, usage: result.usage },
      status: "completed",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    // Save prospects
    let savedCount = 0;
    if (parsed.json?.prospects && Array.isArray(parsed.json.prospects)) {
      for (const p of parsed.json.prospects) {
        await db.insert(prospects).values({
          userId,
          campaignId,
          name: p.name || "Inconnu",
          email: p.email || null,
          company: p.company || null,
          linkedinUrl: p.linkedinUrl || null,
          source: "agent",
          score: p.fitScore || 0,
          status: "new",
          data: { role: p.role, fitReason: p.fitReason },
        });
        savedCount++;
      }
    }

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "find",
        prospectsCreated: savedCount,
        balance,
        nextStep: "qualify",
        message: `${savedCount} prospects générés par l'IA. Étape suivante : qualification.`,
      }),
    };
  } catch (aiError) {
    // Refund
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed",
      error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const res = NextResponse.json(
      { error: "Lead Finder a échoué. Crédits remboursés." },
      { status: 500 }
    );
    return { error: true, response: res };
  }
}

async function runQualifyStep(userId: number, campaignId: number, agent: any) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Qualifier introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  // Get unqualified prospects from this campaign
  const unqualified = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "new")));

  if (unqualified.length === 0) {
    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "qualify",
        qualified: 0,
        nextStep: "generate",
        message: "Tous les prospects sont déjà qualifiés.",
      }),
    };
  }

  // Batch qualify — one Mistral call for all prospects (saves credits + time)
  // Cost: 1 qualifier call (3 credits) instead of N calls
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Qualification batch`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants pour la qualification." },
      { status: 402 }
    );
    return { error: true, response: res };
  }

  const [run] = await db.insert(agentRuns).values({
    userId,
    agentId: agent.id,
    input: { campaignId, prospectCount: unqualified.length },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    // Build prospect list for the AI
    const prospectList = unqualified.map((p, i) => {
      const data = p.data as any;
      return `${i + 1}. Nom: ${p.name}${p.company ? " | Entreprise: " + p.company : ""}${data?.role ? " | Rôle: " + data.role : ""}${data?.fitReason ? " | Raison: " + data.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Qualifie ces ${unqualified.length} prospects. Pour chacun, attribue un score de 0 à 100 et un statut (hot/warm/cold).\n\n${prospectList}\n\nRéponds UNIQUEMENT au format JSON:\n\`\`\`json\n{\n  "results": [\n    {\n      "name": "Nom du prospect",\n      "score": 85,\n      "status": "hot",\n      "reason": "Justification courte"\n    }\n  ]\n}\n\`\`\``;

    const result = await callMistral(agent.systemPrompt, userMessage, {
      temperature: 0.3,
      maxTokens: 2000,
    });

    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json, usage: result.usage },
      status: "completed",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    // Update each prospect with their score
    let qualifiedCount = 0;
    if (parsed.json?.results && Array.isArray(parsed.json.results)) {
      for (const r of parsed.json.results) {
        // Find matching prospect by name
        const prospect = unqualified.find((p) => p.name === r.name);
        if (prospect) {
          const newStatus = r.score >= 70 ? "qualified" : r.score >= 40 ? "qualified" : "new";
          if (r.score >= 40) qualifiedCount++;

          await db.update(prospects).set({
            score: r.score,
            status: newStatus,
            data: { ...((prospect.data as any) || {}), qualifyReason: r.reason, qualifyStatus: r.status },
            updatedAt: new Date(),
          }).where(eq(prospects.id, prospect.id));
        }
      }
    }

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "qualify",
        totalProspects: unqualified.length,
        qualified: qualifiedCount,
        balance,
        nextStep: "generate",
        message: `${unqualified.length} prospects qualifiés. ${qualifiedCount} sont qualifiés (score ≥ 40).`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Qualifier échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed",
      error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const res = NextResponse.json(
      { error: "Qualification échouée. Crédits remboursés." },
      { status: 500 }
    );
    return { error: true, response: res };
  }
}

async function runGenerateStep(userId: number, campaignId: number, agent: any) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Cold Email Writer introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  // Get qualified prospects that don't have messages yet
  const qualifiedProspects = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "qualified")));

  // Filter out those who already have messages
  const existingMessages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.userId, userId));

  const prospectsWithMessages = new Set(existingMessages.map((m) => m.prospectId));
  const toGenerate = qualifiedProspects.filter((p) => !prospectsWithMessages.has(p.id));

  if (toGenerate.length === 0) {
    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "generate",
        messagesGenerated: 0,
        nextStep: "send",
        message: "Tous les prospects qualifiés ont déjà un message.",
      }),
    };
  }

  // Batch generate — one Mistral call for all emails (saves credits + time)
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Génération emails batch`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants pour générer les emails." },
      { status: 402 }
    );
    return { error: true, response: res };
  }

  const [run] = await db.insert(agentRuns).values({
    userId,
    agentId: agent.id,
    input: { campaignId, prospectCount: toGenerate.length },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    // Build prospect info for the AI
    const prospectInfo = toGenerate.map((p, i) => {
      const data = p.data as any;
      return `${i + 1}. Nom: ${p.name}${p.company ? " | Entreprise: " + p.company : ""}${data?.role ? " | Rôle: " + data.role : ""}${data?.fitReason ? " | Fit: " + data.fitReason : ""}${p.email ? " | Email: " + p.email : ""}`;
    }).join("\n");

    const userMessage = `Génère un email de prospection B2B personnalisé pour chacun de ces ${toGenerate.length} prospects. Offre: LeadFlow AI, un SaaS d'agents IA pour la prospection B2B (lead generation, cold email, qualification automatique).\n\n${prospectInfo}\n\nRéponds UNIQUEMENT au format JSON:\n\`\`\`json\n{\n  "emails": [\n    {\n      "name": "Nom du prospect",\n      "subject": "Sujet de l'email",\n      "body": "Corps de l'email (max 120 mots, ton naturel, pas de jargon)"\n    }\n  ]\n}\n\`\`\``;

    const result = await callMistral(agent.systemPrompt, userMessage, {
      temperature: 0.7,
      maxTokens: 3000,
    });

    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json, usage: result.usage },
      status: "completed",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    // Save outreach messages
    let generatedCount = 0;
    if (parsed.json?.emails && Array.isArray(parsed.json.emails)) {
      for (const email of parsed.json.emails) {
        const prospect = toGenerate.find((p) => p.name === email.name);
        if (prospect) {
          await db.insert(outreachMessages).values({
            prospectId: prospect.id,
            userId,
            type: "email",
            subject: email.subject || "Contact professionnel",
            content: email.body || "",
            status: "draft",
          });
          generatedCount++;
        }
      }
    }

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "generate",
        messagesGenerated: generatedCount,
        balance,
        nextStep: "send",
        message: `${generatedCount} emails générés. Vérifiez-les et envoyez-les.`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Email Writer échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed",
      error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const res = NextResponse.json(
      { error: "Génération d'emails échouée. Crédits remboursés." },
      { status: 500 }
    );
    return { error: true, response: res };
  }
}

async function runSendStep(userId: number, campaignId: number) {
  // Get all draft messages for prospects in this campaign
  const campaignProspects = await db
    .select()
    .from(prospects)
    .where(eq(prospects.campaignId, campaignId));

  const prospectIds = campaignProspects.map((p) => p.id);
  if (prospectIds.length === 0) {
    return NextResponse.json({ error: "Aucun prospect dans cette campagne" }, { status: 400 });
  }

  // Get draft messages
  const allMessages = await db
    .select()
    .from(outreachMessages)
    .where(eq(outreachMessages.userId, userId));

  const draftMessages = allMessages.filter(
    (m) => m.status === "draft" && prospectIds.includes(m.prospectId)
  );

  if (draftMessages.length === 0) {
    return NextResponse.json({
      success: true,
      step: "send",
      sent: 0,
      message: "Aucun message en attente d'envoi.",
    });
  }

  // Get user email for reply-to
  const { users } = await import("@/lib/db");
  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userEmail = userRows[0]?.email || "";

  let sent = 0;
  let failed = 0;

  for (const msg of draftMessages) {
    const prospect = campaignProspects.find((p) => p.id === msg.prospectId);
    if (!prospect?.email) {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      failed++;
      continue;
    }

    const result = await sendEmail({
      to: prospect.email,
      subject: msg.subject || "Contact professionnel",
      textContent: msg.content,
      replyTo: userEmail,
      htmlContent: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="white-space: pre-wrap; line-height: 1.6; color: #334155; font-size: 15px;">${msg.content.replace(/\n/g, "<br>")}</div>
        <br><p style="color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px;">Envoyé via LeadFlow AI</p>
      </div>`,
    });

    if (result.success) {
      await db.update(outreachMessages).set({
        status: "sent",
        sentAt: new Date(),
      }).where(eq(outreachMessages.id, msg.id));

      await db.update(prospects).set({
        status: "contacted",
        updatedAt: new Date(),
      }).where(eq(prospects.id, prospect.id));

      sent++;
    } else {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      failed++;
    }
  }

  return NextResponse.json({
    success: true,
    step: "send",
    sent,
    failed,
    message: `${sent} email${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}${failed > 0 ? `, ${failed} échoué${failed > 1 ? "s" : ""}` : ""}`,
  });
}

// GET: Get campaign run status (for polling progress)
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

    // Get counts
    const campaignProspects = await db
      .select()
      .from(prospects)
      .where(eq(prospects.campaignId, campaignId));

    const prospectIds = campaignProspects.map((p) => p.id);
    const allMessages = await db
      .select()
      .from(outreachMessages)
      .where(eq(outreachMessages.userId, user.id));

    const campaignMessages = allMessages.filter((m) => prospectIds.includes(m.prospectId));

    return NextResponse.json({
      stats: {
        totalProspects: campaignProspects.length,
        newProspects: campaignProspects.filter((p) => p.status === "new").length,
        qualified: campaignProspects.filter((p) => p.status === "qualified").length,
        contacted: campaignProspects.filter((p) => p.status === "contacted").length,
        replied: campaignProspects.filter((p) => p.status === "replied").length,
        hot: campaignProspects.filter((p) => p.score >= 70).length,
        warm: campaignProspects.filter((p) => p.score >= 40 && p.score < 70).length,
        cold: campaignProspects.filter((p) => p.score < 40).length,
        draftMessages: campaignMessages.filter((m) => m.status === "draft").length,
        sentMessages: campaignMessages.filter((m) => m.status === "sent").length,
        bouncedMessages: campaignMessages.filter((m) => m.status === "bounced").length,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
