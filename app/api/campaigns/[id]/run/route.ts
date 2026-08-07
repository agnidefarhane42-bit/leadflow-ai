import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, campaigns, prospects, agents, agentRuns, outreachMessages, users } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { consumeCredits, getBalance, addCredits } from "@/lib/credits";
import { callMistral, parseAIResponse } from "@/lib/mistral";
import { sendGmail, domainHasMailServer } from "@/lib/gmail";
import {
  getDomainEmails,
  getDomainFromCompanyName,
  findEmailsByNameAndDomain,
  type SnovCredentials,
} from "@/lib/snov";
import { findCompanyProspects, findCompanyDomain } from "@/lib/email-finder";

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

    // Snov.io credentials (stored as apollo_api_key for backward compat, plus env vars)
    const snovClientId = (userInfo?.apolloApiKey as string) || process.env.SNOV_CLIENT_ID || null;
    const snovClientSecret = process.env.SNOV_CLIENT_SECRET || null;
    const snovCreds: SnovCredentials | null =
      snovClientId && snovClientSecret
        ? { clientId: snovClientId, clientSecret: snovClientSecret }
        : null;

    const allAgents = await db.select().from(agents).where(eq(agents.isActive, true));
    const leadFinder = allAgents.find((a) => a.slug === "lead-finder");
    const qualifier = allAgents.find((a) => a.slug === "prospect-qualifier");
    const emailWriter = allAgents.find((a) => a.slug === "cold-email-writer");

    // STEP 1: FIND
    if (step === "find" || step === "all") {
      const r = await runFindStep(user.id, campaignId, campaign, leadFinder, offerDesc, snovCreds);
      if (r.error) return r.response;
      if (step === "find") return r.response;
    }

    // STEP 2: QUALIFY
    if (step === "qualify" || step === "all") {
      const r = await runQualifyStep(user.id, campaignId, qualifier, offerDesc);
      if (r.error) return r.response;
      if (step === "qualify") return r.response;
    }

    // STEP 3: ENRICH
    if (step === "enrich" || step === "all") {
      const r = await runEnrichStep(user.id, campaignId, snovCreds);
      if (r.error) return r.response;
      if (step === "enrich") return r.response;
    }

    // STEP 4: GENERATE
    if (step === "generate" || step === "all") {
      const r = await runGenerateStep(user.id, campaignId, emailWriter, offerDesc, userCompany);
      if (r.error) return r.response;
      if (step === "generate") return r.response;
    }

    // STEP 5: SEND
    if (step === "send") {
      return await runSendStep(user.id, campaignId);
    }

    const finalProspects = await db.select().from(prospects).where(eq(prospects.campaignId, campaignId));
    const draftMessages = await db.select().from(outreachMessages).where(eq(outreachMessages.userId, user.id));
    const balance = await getBalance(user.id);

    return NextResponse.json({
      success: true, step: "all",
      stats: {
        totalProspects: finalProspects.length,
        qualified: finalProspects.filter((p) => p.status === "qualified" || (p.score ?? 0) >= 50).length,
        withEmail: finalProspects.filter((p) => p.email).length,
        hot: finalProspects.filter((p) => (p.score ?? 0) >= 70).length,
        draftMessages: draftMessages.filter((m) => m.status === "draft").length,
      },
      balance, nextStep: "send",
      message: "Pipeline terminé ! Vérifiez les messages et envoyez-les.",
    });
  } catch (error) {
    console.error("Campaign run error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// ============================================
// STEP 1: FIND — Snov.io Domain Emails
// AI generates company names → Snov finds domains → Snov gets all emails
// ============================================
async function runFindStep(
  userId: number, campaignId: number, campaign: any, agent: any,
  offerDesc: string, snovCreds: SnovCredentials | null
) {
  if (!agent) {
    return { error: true, response: NextResponse.json({ error: "Agent Lead Finder introuvable" }, { status: 500 }) };
  }

  if (!snovCreds) {
    return await runFindStepHouse(userId, campaignId, campaign, agent, offerDesc);
  }

  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (Snov.io)`);
  if (!consumed) {
    return { error: true, response: NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 }) };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id,
    input: { campaignId, source: "snov", criteria: campaign.targetCriteria },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};

    // Step 1a: AI generates real company names based on criteria
    const aiPrompt = `L'utilisateur cherche des entreprises B2B pour son offre:\n${offerDesc}\n\nCritères: ${JSON.stringify(criteria)}\n\nGénère 5 noms d'entreprises RÉELLES et connues qui correspondent à ces critères.\n\nRéponds UNIQUEMENT en JSON:\n\`\`\`json\n{"companies": ["Nom Entreprise 1", "Nom Entreprise 2", ...]}\n\`\`\``;
    const aiResult = await callMistral("Tu es un expert B2B. Réponds uniquement en JSON.", aiPrompt, {
      temperature: 0.5, maxTokens: 800,
    });
    const parsed = parseAIResponse(aiResult.content);
    const companyNames: string[] = parsed.json?.companies || [];

    if (companyNames.length === 0) {
      throw new Error("AI n'a pas généré d'entreprises");
    }

    // Step 1b: Use Snov.io to find domains from company names (bulk, up to 10)
    const domainResults = await getDomainFromCompanyName(snovCreds, companyNames);
    const companiesWithDomains = domainResults.filter((d) => d.domain);

    // If no domains found, fall back to AI generating domains
    let domainsToSearch: { name: string; domain: string }[] = companiesWithDomains.map((d) => ({
      name: d.name, domain: d.domain!,
    }));

    if (domainsToSearch.length === 0) {
      // Ask AI for domains directly
      const domainPrompt = `Donne-moi les domaines web de ces entreprises:\n${companyNames.join(", ")}\n\nJSON:\n\`\`\`json\n{"results": [{"name": "Nom", "domain": "exemple.com"}]}\n\`\`\``;
      const domainAi = await callMistral("Tu es un expert B2B.", domainPrompt, { temperature: 0.3, maxTokens: 800 });
      const domainParsed = parseAIResponse(domainAi.content);
      if (domainParsed.json?.results) {
        domainsToSearch = domainParsed.json.results.filter((r: any) => r.domain);
      }
    }

    // Step 1c: For each domain, get ALL emails via Snov.io Domain Emails
    let savedCount = 0;
    let domainsSearched = 0;

    for (const company of domainsToSearch.slice(0, 5)) {
      if (!company.domain) continue;

      try {
        const emails = await getDomainEmails(snovCreds, company.domain, 25000);
        domainsSearched++;

        for (const emailInfo of emails) {
          if (!emailInfo.email) continue;

          // Skip if already exists
          const existing = await db
            .select()
            .from(prospects)
            .where(and(eq(prospects.campaignId, campaignId), eq(prospects.email, emailInfo.email)))
            .limit(1);
          if (existing.length > 0) continue;

          const fullName = [emailInfo.firstName, emailInfo.lastName].filter(Boolean).join(" ") || emailInfo.email.split("@")[0];

          await db.insert(prospects).values({
            userId, campaignId,
            name: fullName,
            email: emailInfo.email,
            company: company.name,
            source: "snov",
            score: emailInfo.status === "valid" ? 80 : 50,
            status: "new",
            data: {
              role: emailInfo.position,
              domain: company.domain,
              emailStatus: emailInfo.status,
              emailSource: emailInfo.source,
              fitReason: `${emailInfo.position || "Contact"} chez ${company.name}`,
            },
          });
          savedCount++;
        }
      } catch (e) {
        console.error(`Snov domain emails failed for ${company.domain}:`, e);
      }
    }

    await db.update(agentRuns).set({
      output: { source: "snov", companiesFound: domainsToSearch.length, domainsSearched, prospectsSaved: savedCount },
      status: "completed", completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "find", source: "snov",
        prospectsCreated: savedCount,
        domainsSearched,
        balance, nextStep: "qualify",
        message: `${savedCount} prospects avec vrais emails trouvés via Snov.io (Domain Search sur ${domainsSearched} entreprises).`,
      }),
    };
  } catch (err) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder Snov échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed", error: err instanceof Error ? err.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    console.log("Snov failed, falling back to AI...");
    return await runFindStepHouse(userId, campaignId, campaign, agent, offerDesc);
  }
}

// ============================================
// FALLBACK: House Email Finder (no API key needed)
// Scrapes company websites, extracts emails, generates patterns, verifies MX
// ============================================
async function runFindStepHouse(
  userId: number, campaignId: number, campaign: any, agent: any, offerDesc: string
) {
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (House)`);
  if (!consumed) {
    return { error: true, response: NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 }) };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id, input: { campaignId, source: "house" },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};

    // Step 1: AI generates real company names
    const aiPrompt = `L'utilisateur prospecte pour son offre:\n${offerDesc}\n\nCritères: ${JSON.stringify(criteria)}\n\nGénère 5 noms d'entreprises RÉELLES qui correspondent. Donne aussi leur domaine web si tu le connais.\n\nJSON:\n\`\`\`json\n{"companies": [{"name": "Nom", "domain": "exemple.com"}]}\n\`\`\``;
    const aiResult = await callMistral("Tu es un expert B2B. Réponds uniquement en JSON.", aiPrompt, {
      temperature: 0.5, maxTokens: 1000,
    });
    const parsed = parseAIResponse(aiResult.content);
    const aiCompanies: { name: string; domain?: string }[] = parsed.json?.companies || [];

    if (aiCompanies.length === 0) {
      throw new Error("AI n'a pas généré d'entreprises");
    }

    // Step 2: For each company, find domain if not provided, then scrape for emails
    let savedCount = 0;
    let domainsSearched = 0;

    for (const company of aiCompanies.slice(0, 5)) {
      let domain = company.domain || "";

      // Find domain if not provided
      if (!domain) {
        domain = await findCompanyDomain(company.name) || "";
      }

      if (!domain) {
        console.log(`No domain found for ${company.name}`);
        continue;
      }

      domainsSearched++;

      // Scrape company website for emails + names
      const houseProspects = await findCompanyProspects(domain, company.name);

      for (const hp of houseProspects) {
        // Skip if already exists
        const existing = await db
          .select()
          .from(prospects)
          .where(and(eq(prospects.campaignId, campaignId), eq(prospects.email, hp.email)))
          .limit(1);
        if (existing.length > 0) continue;

        await db.insert(prospects).values({
          userId, campaignId,
          name: hp.name,
          email: hp.email,
          company: hp.company,
          source: "house",
          score: hp.emailConfidence,
          status: "new",
          data: {
            role: hp.position,
            domain: hp.domain,
            emailConfidence: hp.emailConfidence,
            emailSource: hp.source,
            fitReason: hp.position ? `${hp.position} chez ${hp.company}` : `Contact chez ${hp.company}`,
          },
        });
        savedCount++;
      }
    }

    await db.update(agentRuns).set({
      output: { source: "house", companiesFound: aiCompanies.length, domainsSearched, prospectsSaved: savedCount },
      status: "completed", completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    const balance = await getBalance(userId);

    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "find", source: "house",
        prospectsCreated: savedCount, domainsSearched, balance, nextStep: "qualify",
        message: `${savedCount} prospects trouvés via le système maison (scraping + MX sur ${domainsSearched} entreprises).`,
      }),
    };
  } catch (err) {
    await addCredits(userId, agent.creditCost, `Remboursement: Lead Finder House échec`, String(run.id));
    await db.update(agentRuns).set({
      status: "failed", error: err instanceof Error ? err.message : "Erreur",
      completedAt: new Date(),
    }).where(eq(agentRuns.id, run.id));

    // Last resort: pure AI fallback (no emails)
    return await runFindStepPureAI(userId, campaignId, campaign, agent, offerDesc);
  }
}

// Ultimate fallback: AI only (no emails, just names + companies)
async function runFindStepPureAI(userId: number, campaignId: number, campaign: any, agent: any, offerDesc: string) {
  const consumed = await consumeCredits(userId, agent.creditCost, `Campagne #${campaignId}: Lead Finder (IA)`);
  if (!consumed) {
    return { error: true, response: NextResponse.json({ error: "Crédits insuffisants." }, { status: 402 }) };
  }

  const [run] = await db.insert(agentRuns).values({
    userId, agentId: agent.id, input: { campaignId, source: "ai_only" },
    creditsConsumed: agent.creditCost, status: "running",
  }).returning();

  try {
    const criteria = campaign.targetCriteria || {};
    const criteriaStr = Object.entries(criteria).map(([k, v]) => `- ${k}: ${v}`).join("\n") || "Aucun critère";
    const userMessage = `Offre:\n${offerDesc}\n\nGénère 8 prospects B2B.\nCritères:\n${criteriaStr}\n\nATTENTION: Ne génère PAS d'emails.\n\nJSON:\n\`\`\`json\n{"prospects": [{"name": "Nom", "company": "Entreprise", "role": "Poste", "fitScore": 85, "fitReason": "Pourquoi"}]}\n\`\`\``;
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
        success: true, step: "find", source: "ai_only",
        prospectsCreated: savedCount, balance, nextStep: "qualify",
        message: `${savedCount} prospects générés par IA (sans emails).`,
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
// STEP 3: ENRICH — Snov.io Email Finder for prospects without email
// ============================================
async function runEnrichStep(userId: number, campaignId: number, snovCreds: SnovCredentials | null) {
  if (!snovCreds) {
    return {
      error: false,
      response: NextResponse.json({
        success: true, step: "enrich", enriched: 0,
        message: "Pas d'identifiants Snov.io — enrichment ignoré.",
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

  // Snov.io Email Finder supports bulk (up to 10 per request)
  let enriched = 0, failed = 0;
  const batches = [];

  for (let i = 0; i < needEnrich.length; i += 10) {
    batches.push(needEnrich.slice(i, i + 10));
  }

  for (const batch of batches) {
    const prospectsToFind = batch.map((p) => {
      const data = p.data as any;
      const nameParts = p.name.split(" ");
      return {
        firstName: nameParts[0] || "",
        lastName: nameParts.slice(1).join(" ") || "",
        domain: data?.domain || "",
      };
    }).filter((p) => p.firstName && p.domain);

    if (prospectsToFind.length === 0) {
      failed += batch.length;
      continue;
    }

    try {
      const results = await findEmailsByNameAndDomain(snovCreds, prospectsToFind, 30000);

      for (let i = 0; i < results.length && i < batch.length; i++) {
        const prospect = batch[i];
        const result = results[i];
        const data = prospect.data as any;

        if (result.email) {
          await db.update(prospects).set({
            email: result.email,
            data: { ...data, snovStatus: result.status, enrichedAt: new Date().toISOString() },
            updatedAt: new Date(),
          }).where(eq(prospects.id, prospect.id));
          enriched++;
        } else {
          failed++;
        }
      }
    } catch (e) {
      console.error("Snov enrich batch failed:", e);
      failed += batch.length;
    }
  }

  return {
    error: false,
    response: NextResponse.json({
      success: true, step: "enrich", enriched, failed,
      message: `${enriched} email(s) trouvé(s) via Snov.io${failed > 0 ? `, ${failed} non trouvé(s)` : ""}.`,
    }),
  };
}

// ============================================
// STEP 2: QUALIFY (IA scoring) — same as before
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
      const d = p.data as any;
      return `${i + 1}. ${p.name}${p.company ? " | " + p.company : ""}${d?.role ? " | " + d.role : ""}${d?.fitReason ? " | " + d.fitReason : ""}`;
    }).join("\n");

    const userMessage = `Offre:\n${offerDesc}\n\nQualifie ces ${unqualified.length} prospects (score 0-100, hot/warm/cold).\n\n${prospectList}\n\nJSON:\n\`\`\`json\n{"results": [{"name": "Nom", "score": 85, "status": "hot", "reason": "Justif"}]}\n\`\`\``;
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
            score: r.score, status: r.score >= 40 ? "qualified" : "new",
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
        message: `${unqualified.length} prospects qualifiés. ${qualifiedCount} qualifiés.`,
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
// STEP 4: GENERATE — same as before
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
// STEP 5: SEND via Gmail — same as before
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
        <br><p style="color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px;">Envoyé via LeadFlow AI</p>
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
