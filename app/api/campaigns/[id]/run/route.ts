import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, prospects, agents, agentRuns, outreachMessages, users } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance, addCredits } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";
import { sendGmail, domainHasMailServer } from "@/lib/gmail";
import { searchPeople, enrichPerson, getApiCredits } from "@/lib/apollo";

// POST: Run a campaign step (or full pipeline)
// Body: { step: "find" | "qualify" | "generate" | "enrich" | "send" | "all" }
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

    // Get user info
    const userRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const userInfo = userRows[0];
    const userCompany = userInfo?.company || user.fullName || "votre entreprise";
    const offerDesc = campaign.offerDescription || `Produit/service de ${userCompany}`;
    const apolloKey = (userInfo?.apolloApiKey || process.env.APOLLO_API_KEY || null) as string | null;

    // Get all agents
    const allAgents = await db.select().from(agents).where(eq(agents.isActive, true));
    const leadFinder = allAgents.find((a) => a.slug === "lead-finder");
    const qualifier = allAgents.find((a) => a.slug === "prospect-qualifier");
    const emailWriter = allAgents.find((a) => a.slug === "cold-email-writer");

    // ============================================
    // STEP 1: FIND (Apollo real prospects)
    // ============================================
    if (step === "find" || step === "all") {
      const findResult = await runFindStep(user.id, campaignId, campaign, leadFinder, offerDesc, apolloKey);
      if (findResult.error) return findResult.response;
      if (step === "find") return findResult.response;
    }

    // ============================================
    // STEP 2: QUALIFY
    // ============================================
    if (step === "qualify" || step === "all") {
      const qualifyResult = await runQualifyStep(user.id, campaignId, qualifier, offerDesc);
      if (qualifyResult.error) return qualifyResult.response;
      if (step === "qualify") return qualifyResult.response;
    }

    // ============================================
    // STEP 3: ENRICH (reveal real emails via Apollo)
    // ============================================
    if (step === "enrich" || step === "all") {
      const enrichResult = await runEnrichStep(user.id, campaignId, apolloKey);
      if (enrichResult.error) return enrichResult.response;
      if (step === "enrich") return enrichResult.response;
    }

    // ============================================
    // STEP 4: GENERATE emails
    // ============================================
    if (step === "generate" || step === "all") {
      const genResult = await runGenerateStep(user.id, campaignId, emailWriter, offerDesc, userCompany);
      if (genResult.error) return genResult.response;
      if (step === "generate") return genResult.response;
    }

    // ============================================
    // STEP 5: SEND
    // ============================================
    if (step === "send") {
      return await runSendStep(user.id, campaignId);
    }

    // Final stats
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
        qualified: finalProspects.filter((p) => p.status === "qualified" || (p.score ?? 0) >= 50).length,
        withEmail: finalProspects.filter((p) => p.email).length,
        hot: finalProspects.filter((p) => (p.score ?? 0) >= 70).length,
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

async function runFindStep(
  userId: number,
  campaignId: number,
  campaign: any,
  agent: any,
  offerDesc: string,
  apolloKey: string | null
) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Lead Finder introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  // If no Apollo key, fall back to AI generation (with warning)
  if (!apolloKey) {
    const findResult = await runFindStepAI(userId, campaignId, campaign, agent, offerDesc);
    return findResult;
  }

  // Use Apollo People API Search (0 credits on Apollo, LeadFlow credits still apply)
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (Apollo)`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants. Achetez plus de crédits pour continuer." },
      { status: 402 }
    );
    return { error: true, response: res };
  }

  const [run] = await db.insert(agentRuns).values({
    userId,
    agentId: agent.id,
    input: { campaignId, source: "apollo", criteria: campaign.targetCriteria },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};

    // Build Apollo search params from campaign criteria
    const searchParams: any = {
      perPage: 10,
      page: 1,
    };

    if (criteria.role) {
      searchParams.titles = [criteria.role];
    }
    if (criteria.industry) {
      searchParams.keywords = criteria.industry;
    }
    if (criteria.location) {
      searchParams.organizationLocations = [criteria.location];
    }
    if (criteria.companySize) {
      // Try to parse "10-50" format
      const sizeMatch = String(criteria.companySize).match(/(\d+)\s*[-–]\s*(\d+)/);
      if (sizeMatch) {
        searchParams.companySizeRanges = [`${sizeMatch[1]},${sizeMatch[2]}`];
      }
    }

    const apolloResult = await searchPeople(apolloKey, searchParams);

    let savedCount = 0;
    for (const p of apolloResult.people) {
      // Skip if already exists in this campaign (by name + company)
      const existing = await db
        .select()
        .from(prospects)
        .where(and(
          eq(prospects.campaignId, campaignId),
          eq(prospects.name, p.full_name)
        ))
        .limit(1);

      if (existing.length > 0) continue;

      await db.insert(prospects).values({
        userId,
        campaignId,
        name: p.full_name,
        email: null, // Apollo search doesn't return emails — enrich step reveals them
        company: p.organization_name,
        linkedinUrl: p.linkedin_url,
        source: "apollo",
        score: 0,
        status: "new",
        data: {
          role: p.title,
          domain: p.organization_domain,
          city: p.city,
          country: p.country,
          seniority: p.seniority,
          departments: p.departments,
          apolloId: p.id,
          fitReason: `Trouvé via Apollo — ${p.title || "poste inconnu"} chez ${p.organization_name || "entreprise inconnue"}`,
        },
      });
      savedCount++;
    }

    await db.update(agentRuns).set({
      output: {
        source: "apollo",
        prospectsFound: apolloResult.total,
        prospectsSaved: savedCount,
        apolloCreditsRemaining: apolloResult.remainingCredits,
      },
      status: "completed",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "find",
        source: "apollo",
        prospectsCreated: savedCount,
        apolloCreditsRemaining: apolloResult.remainingCredits,
        balance,
        nextStep: "qualify",
        message: `${savedCount} vrais prospects trouvés via Apollo (emails réels révélés à l'étape suivante). Crédits Apollo restants: ${apolloResult.remainingCredits}`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder Apollo échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed",
      error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    // Fall back to AI generation if Apollo fails
    console.log("Apollo failed, falling back to AI generation...");
    return await runFindStepAI(userId, campaignId, campaign, agent, offerDesc);
  }
}

// Fallback: AI-generated prospects (emails may be fake)
async function runFindStepAI(userId: number, campaignId: number, campaign: any, agent: any, offerDesc: string) {
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (IA)`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants." },
      { status: 402 }
    );
    return { error: true, response: res };
  }

  const [run] = await db.insert(agentRuns).values({
    userId,
    agentId: agent.id,
    input: { campaignId, source: "ai_fallback" },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};
    const criteriaStr = Object.entries(criteria)
      .map(([k, v]) => `- ${k}: ${v}`)
      .join("\n") || "Aucun critère spécifique";

    const userMessage = `Contexte: L'utilisateur prospecte pour son offre:\n${offerDesc}\n\nGénère 8 prospects B2B potentiels.\nCritères:\n${criteriaStr}\n\nATTENTION: Ne génère PAS d'adresses email inventées. Laisse le champ email vide — il sera enrichi plus tard.\n\nRéponds UNIQUEMENT en JSON:\n\`\`\`json\n{\n  "prospects": [\n    {\n      "name": "Nom complet",\n      "company": "Entreprise",\n      "role": "Poste",\n      "fitScore": 85,\n      "fitReason": "Pourquoi"\n    }\n  ]\n}\n\`\`\``;

    const result = await callMistral(agent.systemPrompt, userMessage, {
      temperature: 0.8,
      maxTokens: 2000,
    });

    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json },
      status: "completed",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    let savedCount = 0;
    if (parsed.json?.prospects && Array.isArray(parsed.json.prospects)) {
      for (const p of parsed.json.prospects) {
        await db.insert(prospects).values({
          userId,
          campaignId,
          name: p.name || "Inconnu",
          email: null, // No email from AI — must be enriched
          company: p.company || null,
          source: "ai",
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
        source: "ai_fallback",
        prospectsCreated: savedCount,
        balance,
        nextStep: "qualify",
        message: `${savedCount} prospects générés par IA (sans Apollo — emails à vérifier manuellement).`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder IA échec`, String(run.id));
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

// ============================================
// STEP: ENRICH (reveal real emails via Apollo)
// ============================================
async function runEnrichStep(userId: number, campaignId: number, apolloKey: string | null) {
  if (!apolloKey) {
    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "enrich",
        enriched: 0,
        message: "Pas de clé Apollo — enrichment ignoré. Les emails doivent être ajoutés manuellement.",
      }),
    };
  }

  // Get qualified prospects without email
  const qualifiedProspects = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "qualified")));

  const needEnrich = qualifiedProspects.filter((p) => !p.email);

  if (needEnrich.length === 0) {
    return {
      error: false,
      response: NextResponse.json({
        success: true,
        step: "enrich",
        enriched: 0,
        message: "Tous les prospects qualifiés ont déjà un email.",
      }),
    };
  }

  let enriched = 0;
  let failed = 0;

  for (const prospect of needEnrich) {
    const data = prospect.data as any;

    try {
      const result = await enrichPerson(apolloKey, {
        name: prospect.name,
        organizationName: prospect.company || undefined,
        domain: data?.domain || undefined,
        linkedinUrl: prospect.linkedinUrl || undefined,
      });

      if (result.email) {
        await db.update(prospects).set({
          email: result.email,
          data: {
            ...data,
            apolloEmailStatus: result.emailStatus,
            apolloEnrichedAt: new Date().toISOString(),
          },
          updatedAt: new Date(),
        }).where(eq(prospects.id, prospect.id));
        enriched++;
      } else {
        failed++;
      }
    } catch (e) {
      console.error(`Enrichment failed for ${prospect.name}:`, e);
      failed++;
    }
  }

  return {
    error: false,
    response: NextResponse.json({
      success: true,
      step: "enrich",
      enriched,
      failed,
      message: `${enriched} email(s) réel(s) révélé(s) via Apollo${failed > 0 ? `, ${failed} non trouvé(s)` : ""}.`,
    }),
  };
}

async function runQualifyStep(userId: number, campaignId: number, agent: any, offerDesc: string) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Qualifier introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

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
        nextStep: "enrich",
        message: "Tous les prospects sont déjà qualifiés.",
      }),
    };
  }

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
    const prospectList = unqualified.map((p, i) => {
      const data = p.data as any;
      return `${i + 1}. Nom: ${p.name}${p.company ? " | Entreprise: " + p.company : ""}${data?.role ? " | Rôle: " + data.role : ""}${data?.fitReason ? " | Raison: " + data.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Contexte: L'utilisateur prospecte pour cette offre:\n${offerDesc}\n\nQualifie ces ${unqualified.length} prospects. Score 0-100 et statut (hot/warm/cold).\n\n${prospectList}\n\nRéponds UNIQUEMENT en JSON:\n\`\`\`json\n{\n  "results": [\n    {\n      "name": "Nom",\n      "score": 85,\n      "status": "hot",\n      "reason": "Justification"\n    }\n  ]\n}\n\`\`\``;

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

    let qualifiedCount = 0;
    if (parsed.json?.results && Array.isArray(parsed.json.results)) {
      for (const r of parsed.json.results) {
        const prospect = unqualified.find((p) => p.name === r.name);
        if (prospect) {
          const newStatus = r.score >= 40 ? "qualified" : "new";
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
        nextStep: "enrich",
        message: `${unqualified.length} prospects qualifiés. ${qualifiedCount} qualifiés (score ≥ 40).`,
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

async function runGenerateStep(userId: number, campaignId: number, agent: any, offerDesc: string, userCompany: string) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Cold Email Writer introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  const qualifiedProspects = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "qualified")));

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

  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Génération emails`);
  if (!consumed) {
    const res = NextResponse.json(
      { error: "Crédits insuffisants." },
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
    const prospectInfo = toGenerate.map((p, i) => {
      const data = p.data as any;
      return `${i + 1}. Nom: ${p.name}${p.company ? " | Entreprise: " + p.company : ""}${data?.role ? " | Rôle: " + data.role : ""}${data?.fitReason ? " | Fit: " + data.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Contexte: Tu écris des emails au nom de "${userCompany}".\nOffre:\n${offerDesc}\n\nGénère un email de prospection B2B pour chacun de ces ${toGenerate.length} prospects.\n\n${prospectInfo}\n\nRéponds UNIQUEMENT en JSON:\n\`\`\`json\n{\n  "emails": [\n    {\n      "name": "Nom du prospect",\n      "subject": "Sujet",\n      "body": "Corps (max 120 mots, ton naturel)"\n    }\n  ]\n}\n\`\`\``;

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
        message: `${generatedCount} emails générés.`,
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
      { error: "Génération échouée. Crédits remboursés." },
      { status: 500 }
    );
    return { error: true, response: res };
  }
}

async function runSendStep(userId: number, campaignId: number) {
  const campaignProspects = await db
    .select()
    .from(prospects)
    .where(eq(prospects.campaignId, campaignId));

  const prospectIds = campaignProspects.map((p) => p.id);
  if (prospectIds.length === 0) {
    return NextResponse.json({ error: "Aucun prospect dans cette campagne" }, { status: 400 });
  }

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

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userInfo = userRows[0];
  const userEmail = userInfo?.email || "";
  const refreshToken = userInfo?.googleRefreshToken;

  if (!refreshToken) {
    return NextResponse.json({
      error: "Gmail non connecté. Allez dans le Dashboard pour connecter votre compte Google.",
    }, { status: 400 });
  }

  let sent = 0;
  let failed = 0;
  let noEmail = 0;

  for (const msg of draftMessages) {
    const prospect = campaignProspects.find((p) => p.id === msg.prospectId);
    if (!prospect?.email) {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      noEmail++;
      continue;
    }

    // Verify domain has mail server before sending
    const domainValid = await domainHasMailServer(prospect.email);
    if (!domainValid) {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      failed++;
      continue;
    }

    const result = await sendGmail({
      to: prospect.email,
      subject: msg.subject || "Contact professionnel",
      textContent: msg.content,
      replyTo: userEmail,
      refreshToken,
      htmlContent: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="white-space: pre-wrap; line-height: 1.6; color: #334155; font-size: 15px;">${msg.content.replace(/\n/g, "<br>")}</div>
        <br>
        <p style="color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px;">
          Envoyé via LeadFlow AI
        </p>
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

  const balance = await getBalance(userId);

  return NextResponse.json({
    success: true,
    step: "send",
    sent,
    failed,
    noEmail,
    balance,
    message: `${sent} email(s) envoyé(s)${failed > 0 ? `, ${failed} échec(s)` : ""}${noEmail > 0 ? `, ${noEmail} sans email` : ""}.`,
  });
}
