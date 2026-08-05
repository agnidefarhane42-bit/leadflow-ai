import { NextRequest, NextResponse } from "next/server";
import { db, leads, qualifications, users } from "@/lib/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Scoring rules
const SCORING_RULES: Record<string, Record<string, number>> = {
  budget: {
    "< 500€": 10,
    "500€ - 2000€": 25,
    "2000€ - 5000€": 40,
    "> 5000€": 50,
  },
  need: {
    "Site web / Landing page": 15,
    "Automatisation / IA": 30,
    "Lead generation": 35,
    "Développement complet": 40,
  },
  timeline: {
    "Immédiatement": 30,
    "1-2 semaines": 25,
    "1 mois": 15,
    "Plus tard": 5,
  },
  role: {
    "Oui, je décide": 25,
    "Je valide avec un associé": 15,
    "Je recommande": 5,
  },
};

const MAX_SCORE = 170;

function getLeadStatus(score: number): { status: string; label: string; color: string } {
  if (score >= 120) return { status: "hot", label: "Lead Hot", color: "#ef4444" };
  if (score >= 70) return { status: "warm", label: "Lead Warm", color: "#f59e0b" };
  return { status: "cold", label: "Lead Cold", color: "#3b82f6" };
}

// POST: Create + qualify a lead
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, company, phone, source, userId, answers } = body;

    if (!name || !email) {
      return NextResponse.json({ error: "Name and email are required" }, { status: 400 });
    }

    // Calculate score from answers
    let totalScore = 0;
    const qualificationData: { question: string; answer: string; scoreWeight: number }[] = [];

    if (answers) {
      for (const [key, value] of Object.entries(answers)) {
        const rules = SCORING_RULES[key];
        const valStr = String(value);
        if (rules && valStr in rules) {
          const weight = rules[valStr];
          totalScore += weight;
          qualificationData.push({
            question: key,
            answer: valStr,
            scoreWeight: weight,
          });
        }
      }
    }

    const { status, label } = getLeadStatus(totalScore);

    // Insert lead into database
    const [lead] = await db
      .insert(leads)
      .values({
        name,
        email,
        company: company || null,
        phone: phone || null,
        source: source || "landing",
        score: totalScore,
        status,
        budget: answers?.budget || null,
        need: answers?.need || null,
        timeline: answers?.timeline || null,
        userId: userId || null,
      })
      .returning();

    // Insert qualification responses
    if (qualificationData.length > 0 && lead) {
      for (const q of qualificationData) {
        await db.insert(qualifications).values({
          leadId: lead.id,
          question: q.question,
          answer: q.answer,
          scoreWeight: q.scoreWeight,
        });
      }
    }

    // Send notification email for hot/warm leads
    if ((status === "hot" || status === "warm") && resend) {
      try {
        await resend.emails.send({
          from: "LeadFlow AI <notifications@leadflow.ai>",
          to: ["contact@leadflow.ai"],
          subject: status === "hot" ? "🔥 Nouveau lead HOT !" : "⚡ Nouveau lead warm",
          html: `
            <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: ${status === "hot" ? "#ef4444" : "#f59e0b"};">
                ${label} — ${name}
              </h2>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b;">Score</td><td style="padding: 8px 0; font-weight: bold;">${totalScore}/${MAX_SCORE}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0;">${email}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Entreprise</td><td style="padding: 8px 0;">${company || "N/A"}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Téléphone</td><td style="padding: 8px 0;">${phone || "N/A"}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Budget</td><td style="padding: 8px 0;">${answers?.budget || "N/A"}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Besoin</td><td style="padding: 8px 0;">${answers?.need || "N/A"}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Timeline</td><td style="padding: 8px 0;">${answers?.timeline || "N/A"}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b;">Source</td><td style="padding: 8px 0;">${source || "landing"}</td></tr>
              </table>
              <p style="margin-top: 20px; padding: 16px; background: #f8fafc; border-radius: 8px;">
                ${status === "hot" ? "Ce lead est qualifié. Contactez-le rapidement pour planifier un RDV !" : "Ce lead est intéressant. Un suivi sous 48h est recommandé."}
              </p>
              <a href="${process.env.NEXT_PUBLIC_APP_URL || ""}/dashboard" style="display: inline-block; margin-top: 20px; padding: 12px 24px; background: #4f46e5; color: white; text-decoration: none; border-radius: 8px; font-weight: 600;">
                Voir sur le dashboard
              </a>
            </div>
          `,
        });
      } catch (emailError) {
        console.error("Email notification failed:", emailError);
      }
    }

    return NextResponse.json({
      success: true,
      lead: {
        id: lead?.id,
        name,
        email,
        score: totalScore,
        status,
        label,
        maxScore: MAX_SCORE,
      },
    });
  } catch (error) {
    console.error("Lead creation error:", error);
    return NextResponse.json({ error: "Failed to create lead" }, { status: 500 });
  }
}

// GET: List all leads
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50");

    let result;
    if (status) {
      result = await db.select().from(leads).where(eq(leads.status, status)).limit(limit);
    } else {
      result = await db.select().from(leads).limit(limit);
    }

    return NextResponse.json({ leads: result });
  } catch (error) {
    console.error("Failed to fetch leads:", error);
    return NextResponse.json({ error: "Failed to fetch leads" }, { status: 500 });
  }
}
