import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, prospects, agents, agentRuns, outreachMessages, users } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance, addCredits } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";
import { sendGmail, domainHasMailServer } from "@/lib/gmail";
import { domainSearch, findEmail, discoverCompanies } from "@/lib/hunter";

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

    const campaignRows = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.userId, user.id)))
      .limit(1);

    if (campaignRows.length === 0) {
      return NextResponse.json({ error: "Campagne introuvable" }, { status: 404 });
    }
    const campaign = campaignRows[0];

    const userRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const userInfo = userRows[0];
    const userCompany = userInfo?.company || user.fullName || "votre entreprise";
    const offerDesc = campaign.offerDescription || `Produit/service de ${userCompany}`;
    const hunterKey = (userInfo?.apolloApiKey || process.env.HUNTER_API_KEY || null) as string | null;

    const allAgents = await db.select().from(agents).where(eq(agents.isActive, true));
    const leadFinder = allAgents.find((a) => a.slug === "lead-finder");
    const qualifier = allAgents.find((a) => a.slug === "prospect-qualifier");
    const emailWriter = allAgents.find((a) => a.slug === "cold-email-writer");

    // ============================================
    // STEP 1: FIND (Hunter.io Discover + Domain Search)
    // ============================================
    if (step === "find" || step === "all") {
      const findResult = await runFindStep(user.id, campaignId, campaign, leadFinder, offerDesc, hunterKey);
      if (findResult.error) return findResult.response;
      if (step === "find") return findResult.response;
    }

    // STEP 2: QUALIFY
    if (step === "qualify" || step === "all") {
      const qualifyResult = await runQualifyStep(user.id, campaignId, qualifier, offerDesc);
      if (qualifyResult.error) return qualifyResult.response;
      if (step === "qualify") return qualifyResult.response;
    }

    // STEP 3: ENRICH (Hunter.io email finder)
    if (step === "enrich" || step === "all") {
      const enrichResult = await runEnrichStep(user.id, campaignId, hunterKey);
      if (enrichResult.error) return enrichResult.response;
      if (step === "enrich") return enrichResult.response;
    }

    // STEP 4: GENERATE
    if (step === "generate" || step === "all") {
      const genResult = await runGenerateStep(user.id, campaignId, emailWriter, offerDesc, userCompany);
      if (genResult.error) return genResult.response;
      if (step === "generate") return genResult.response;
    }

    // STEP 5: SEND
    if (step === "send") {
      return await runSendStep(user.id, campaignId);
    }

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
// STEP 1: FIND — Hunter.io Discover (free) + Domain Search (1 credit/domain)
// ============================================
async function runFindStep(
  userId: number,
  campaignId: number,
  campaign: any,
  agent: any,
  offerDesc: string,
  hunterKey: string | null
) {
  if (!agent) {
    const res = NextResponse.json({ error: "Agent Lead Finder introuvable" }, { status: 500 });
    return { error: true, response: res };
  }

  if (!hunterKey) {
    return await runFindStepAI(userId, campaignId, campaign, agent, offerDesc);
  }

  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (Hunter.io)`);
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
    input: { campaignId, source: "hunter", criteria: campaign.targetCriteria },
    creditsConsumed: agent.creditCost,
    status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};

    // Step 1a: Use Hunter Discover (FREE) to find companies matching criteria
    const discoverQuery = [
      criteria.industry ? `companies in ${criteria.industry}` : "",
      criteria.location ? `in ${criteria.location}` : "",
    ].filter(Boolean).join(" ") || "Companies in technology";

    const discoverParams: any = { query: discoverQuery, limit: 10 };
    if (criteria.companySize) {
      const sizeMap: Record<string, string> = {
        "1-10": "1-10", "11-50": "11-50", "51-200": "51-200",
        "201-500": "201-500", "501-1000": "501-1000",
      };
      if (sizeMap[criteria.companySize]) discoverParams.headcount = sizeMap[criteria.companySize];
    }
    if (criteria.location) {
      // Try to map location to country code
      const countryMap: Record<string, string> = {
        "Benin": "BJ", "Bénin": "BJ", "Nigeria": "NG", "Ghana": "GH",
        "Senegal": "SN", "Sénégal": "SN", "France": "FR", "USA": "US",
        "United States": "US", "UK": "GB", "Germany": "DE", "Spain": "ES",
      };
      if (countryMap[criteria.location]) discoverParams.country = countryMap[criteria.location];
    }

    let companies: { domain: string; name: string; industry: string | null }[] = [];
    try {
      const discoverResult = await discoverCompanies(hunterKey, discoverParams);
      companies = discoverResult.companies;
    } catch (e) {
      console.log("Hunter Discover failed, using AI to suggest companies...");
    }

    // If Discover returns nothing, use AI to generate company domains
    if (companies.length === 0) {
      const aiPrompt = `L'utilisateur cherche des entreprises B2B pour son offre:\n${offerDesc}\n\nCritères: ${JSON.stringify(criteria)}\n\nGénère 5 noms d'entreprises RÉELLES qui correspondent à ces critères, avec leur domaine web.\n\nRéponds en JSON:\n\`\`\`json\n{"companies": [{"name": "Nom", "domain": "exemple.com"}]}\n\`\`\``;
      const aiResult = await callMistral("Tu es un expert en B2B. Réponds uniquement en JSON.", aiPrompt, {
        temperature: 0.5,
        maxTokens: 1000,
      });
      const parsed = parseAIResponse(aiResult.content);
      if (parsed.json?.companies) {
        companies = parsed.json.companies.map((c: any) => ({
          domain: c.domain,
          name: c.name,
          industry: criteria.industry || null,
        }));
      }
    }

    // Step 1b: For each company, use Hunter Domain Search (1 credit) to get ALL emails
    let savedCount = 0;
    let totalRemaining = 0;

    for (const company of companies) {
      if (!company.domain) continue;

      try {
        const domainResult = await domainSearch(hunterKey, company.domain, { limit: 10 });
        totalRemaining = domainResult.remainingCredits;

        for (const email of domainResult.emails) {
          // Skip if already exists
          const existing = await db
            .select()
            .from(prospects)
            .where(and(
              eq(prospects.campaignId, campaignId),
              eq(prospects.email, email.value)
            ))
            .limit(1);
          if (existing.length > 0) continue;

          const fullName = [email.first_name, email.last_name].filter(Boolean).join(" ") || email.value.split("@")[0];

          await db.insert(prospects).values({
            userId,
            campaignId,
            name: fullName,
            email: email.value, // Real verified email from Hunter!
            company: domainResult.organization || company.name,
            linkedinUrl: email.linkedin_url,
            source: "hunter",
            score: email.confidence * 100,
            status: "new",
            data: {
              role: email.position,
              seniority: email.seniority,
              department: email.department,
              domain: company.domain,
              emailConfidence: email.confidence,
              emailType: email.type,
              fitReason: `${email.position || "Contact"} chez ${domainResult.organization || company.name} (confiance: ${email.confidence * 100}%)`,
            },
          });
          savedCount++;
        }
      } catch (e) {
        console.error(`Domain search failed for ${company.domain}:`, e);
      }
    }

    await db.update(agentRuns).set({
      output: {
        source: "hunter",
        companiesFound: companies.length,
        prospectsSaved: savedCount,
        hunterCreditsRemaining: totalRemaining,
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
        source: "hunter",
        prospectsCreated: savedCount,
        hunterCreditsRemaining: totalRemaining,
        balance,
        nextStep: "qualify",
        message: `${savedCount} prospects avec vrais emails trouvés via Hunter.io (Domain Search sur ${companies.length} entreprises). Crédits Hunter restants: ${totalRemaining}`,
      }),
    };
  } catch (err) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder Hunter échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed",
      error: err instanceof Error ? err.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    console.log("Hunter failed, falling back to AI...");
    return await runFindStepAI(userId, campaignId, campaign, agent, offerDesc);
  }
}

// Fallback: AI-generated prospects (no real emails)
async function runFindStepAI(userId: number, campaignId: number, campaign: any, agent: any, offerDesc: string) {
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (IA)`);
  if (!consumed) {
    const res = NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 });
    return { error: true, response: res };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id,
    input: { campaignId, source: "ai_fallback" },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};
    const criteriaStr = Object.entries(criteria).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "Aucun critère";
    const userMessage = `Contexte: L'utilisateur prospecte pour son offre:\n${offerDesc}\n\nGénère 8 prospects B2B.\nCritères:\n${criteriaStr}\n\nATTENTION: Ne génère PAS d'emails inventés.\n\nRéponds en JSON:\n\`\`\`json\n{"prospects": [{"name": "Nom", "company": "Entreprise", "role": "Poste", "fitScore": 85, "fitReason": "Pourquoi"}]}\n\`\`\``;
    const result = await callMistral(agent.systemPrompt, userMessage, { temperature: 0.8, maxTokens: 2000 });
    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json },
      status: "completed", completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    let savedCount = 0;
    if (parsed.json?.prospects) {
      for (const p of parsed.json.prospects) {
        await db.insert(prospects).values({
          userId, campaignId, name: p.name || "Inconnu", email: null,
          company: p.company || null, source: "ai", score: p.fitScore || 0,
          status: "new", data: { role: p.role, fitReason: p.fitReason },
        });
        savedCount++;
      }
    }

    const balance = await getBalance(userId);
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "find", source: "ai_fallback",
        prospectsCreated: savedCount, balance, nextStep: "qualify",
        message: `${savedCount} prospects générés par IA (sans Hunter — ajoutez votre clé Hunter.io dans Paramètres).`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder IA échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed", error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));
    return { error: true, response: NextResponse.json({ error: "Lead Finder échoué." }, { status: 500 }) };
  }
}

// ============================================
// STEP 3: ENRICH — find emails for qualified prospects without email
// ============================================
async function runEnrichStep(userId: number, campaignId: number, hunterKey: string | null) {
  if (!hunterKey) {
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "enrich", enriched: 0,
        message: "Pas de clé Hunter.io — enrichment ignoré.",
      }),
    };
  }

  const qualified = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "qualified")));

  const needEnrich = qualified.filter((p) => !p.email);
  if (needEnrich.length === 0) {
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "enrich", enriched: 0,
        message: "Tous les prospects ont déjà un email.",
      }),
    };
  }

  let enriched = 0, failed = 0;
  for (const prospect of needEnrich) {
    const data = prospect.data as any;
    try {
      const result = await findEmail(hunterKey, {
        fullName: prospect.name,
        domain: data?.domain,
      });

      if (result.email) {
        await db.update(prospects).set({
          email: result.email,
          data: { ...data, hunterConfidence: result.confidence, enrichedAt: new Date().toISOString() },
          updatedAt: new Date(),
        }).where(eq(prospects.id, prospect.id));
        enriched++;
      } else {
        failed++;
      }
    } catch (e) {
      failed++;
    }
  }

  return {
    error: false,
    response: NextResponse.json({
      success: true, step: "enrich", enriched, failed,
      message: `${enriched} email(s) trouvé(s) via Hunter${failed > 0 ? `, ${failed} non trouvé(s)` : ""}.`,
    }),
  };
}

// ============================================
// STEP 2: QUALIFY (IA scoring)
// ============================================
async function runQualifyStep(userId: number, campaignId: number, agent: any, offerDesc: string) {
  if (!agent) {
    return { error: true, response: NextResponse.json({ error: "Agent Qualifier introuvable" }, { status: 500 }) };
  }

  const unqualified = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "new")));

  if (unqualified.length === 0) {
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "qualify", qualified: 0, nextStep: "enrich",
        message: "Tous les prospects sont déjà qualifiés.",
      }),
    };
  }

  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Qualification`);
  if (!consumed) {
    return { error: true, response: NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 }) };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id, input: { campaignId, count: unqualified.length },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const prospectList = unqualified.map((p, i) => {
      const data = p.data as any;
      return `${i + 1}. ${p.name}${p.company ? " | " + p.company : ""}${data?.role ? " | " + data.role : ""}${data?.fitReason ? " | " + data.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Offre:\n${offerDesc}\n\nQualifie ces ${unqualified.length} prospects (score 0-100, statut hot/warm/cold).\n\n${prospectList}\n\nJSON:\n\`\`\`json\n{"results": [{"name": "Nom", "score": 85, "status": "hot", "reason": "Justif"}]}\n\`\`\``;
    const result = await callMistral(agent.systemPrompt, userMessage, { temperature: 0.3, maxTokens: 2000 });
    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json },
      status: "completed", completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    let qualifiedCount = 0;
    if (parsed.json?.results) {
      for (const r of parsed.json.results) {
        const prospect = unqualified.find((p) => p.name === r.name);
        if (prospect) {
          if (r.score >= 40) qualifiedCount++;
          await db.update(prospects).set({
            score: r.score,
            status: r.score >= 40 ? "qualified" : "new",
            data: { ...((prospect.data as any) || {}), qualifyReason: r.reason },
            updatedAt: new Date(),
          }).where(eq(prospects.id, prospect.id));
        }
      }
    }

    const balance = await getBalance(userId);
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "qualify", totalProspects: unqualified.length,
        qualified: qualifiedCount, balance, nextStep: "enrich",
        message: `${unqualified.length} prospects qualifiés. ${qualifiedCount} qualifiés (score ≥ 40).`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Qualifier échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed", error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));
    return { error: true, response: NextResponse.json({ error: "Qualification échouée." }, { status: 500 }) };
  }
}

// ============================================
// STEP 4: GENERATE emails
// ============================================
async function runGenerateStep(userId: number, campaignId: number, agent: any, offerDesc: string, userCompany: string) {
  if (!agent) {
    return { error: true, response: NextResponse.json({ error: "Agent Email Writer introuvable" }, { status: 500 }) };
  }

  const qualified = await db
    .select()
    .from(prospects)
    .where(and(eq(prospects.campaignId, campaignId), eq(prospects.status, "qualified")));

  const existingMessages = await db.select().from(outreachMessages).where(eq(outreachMessages.userId, userId));
  const withMessages = new Set(existingMessages.map((m) => m.prospectId));
  const toGenerate = qualified.filter((p) => !withMessages.has(p.id));

  if (toGenerate.length === 0) {
    return { error: false, response: NextResponse.json({ success: true, step: "generate", messagesGenerated: 0, nextStep: "send", message: "Tous les prospects ont déjà un message." }) };
  }

  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Génération emails`);
  if (!consumed) {
    return { error: true, response: NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 }) };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id, input: { campaignId, count: toGenerate.length },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const prospectInfo = toGenerate.map((p, i) => {
      const d = p.data as any;
      return `${i + 1}. ${p.name}${p.company ? " | " + p.company : ""}${d?.role ? " | " + d.role : ""}${d?.fitReason ? " | " + d.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Tu écris au nom de "${userCompany}".\nOffre:\n${offerDesc}\n\nGénère un email B2B pour chacun de ces ${toGenerate.length} prospects.\n\n${prospectInfo}\n\nJSON:\n\`\`\`json\n{"emails": [{"name": "Nom", "subject": "Sujet", "body": "Corps (max 120 mots)"}]}\n\`\`\``;
    const result = await callMistral(agent.systemPrompt, userMessage, { temperature: 0.7, maxTokens: 3000 });
    const parsed = parseAIResponse(result.content);

    await db.update(agentRuns).set({
      output: { content: result.content, parsed: parsed.json },
      status: "completed", completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    let generatedCount = 0;
    if (parsed.json?.emails) {
      for (const email of parsed.json.emails) {
        const prospect = toGenerate.find((p) => p.name === email.name);
        if (prospect) {
          await db.insert(outreachMessages).values({
            prospectId: prospect.id, userId, type: "email",
            subject: email.subject || "Contact professionnel",
            content: email.body || "", status: "draft",
          });
          generatedCount++;
        }
      }
    }

    const balance = await getBalance(userId);
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "generate", messagesGenerated: generatedCount,
        balance, nextStep: "send", message: `${generatedCount} emails générés.`,
      }),
    };
  } catch (aiError) {
    await addCredits(userId, agent.creditCost, `Remboursement: Email Writer échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed", error: aiError instanceof Error ? aiError.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));
    return { error: true, response: NextResponse.json({ error: "Génération échouée." }, { status: 500 }) };
  }
}

// ============================================
// STEP 5: SEND via Gmail
// ============================================
async function runSendStep(userId: number, campaignId: number) {
  const campaignProspects = await db.select().from(prospects).where(eq(prospects.campaignId, campaignId));
  const prospectIds = campaignProspects.map((p) => p.id);

  if (prospectIds.length === 0) {
    return NextResponse.json({ error: "Aucun prospect" }, { status: 400 });
  }

  const allMessages = await db.select().from(outreachMessages).where(eq(outreachMessages.userId, userId));
  const drafts = allMessages.filter((m) => m.status === "draft" && prospectIds.includes(m.prospectId));

  if (drafts.length === 0) {
    return NextResponse.json({ success: true, step: "send", sent: 0, message: "Aucun message en attente." });
  }

  const userRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const userInfo = userRows[0];
  const userEmail = userInfo?.email || "";
  const refreshToken = userInfo?.googleRefreshToken;

  if (!refreshToken) {
    return NextResponse.json({ error: "Gmail non connecté." }, { status: 400 });
  }

  let sent = 0, failed = 0, noEmail = 0;

  for (const msg of drafts) {
    const prospect = campaignProspects.find((p) => p.id === msg.prospectId);
    if (!prospect?.email) {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      noEmail++;
      continue;
    }

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
      await db.update(outreachMessages).set({ status: "sent", sentAt: new Date() }).where(eq(outreachMessages.id, msg.id));
      await db.update(prospects).set({ status: "contacted", updatedAt: new Date() }).where(eq(prospects.id, prospect.id));
      sent++;
    } else {
      await db.update(outreachMessages).set({ status: "bounced" }).where(eq(outreachMessages.id, msg.id));
      failed++;
    }
  }

  const balance = await getBalance(userId);
  return NextResponse.json({
    success: true, step: "send", sent, failed, noEmail, balance,
    message: `${sent} envoyé(s)${failed > 0 ? `, ${failed} échec(s)` : ""}${noEmail > 0 ? `, ${noEmail} sans email` : ""}.`,
  });
}
