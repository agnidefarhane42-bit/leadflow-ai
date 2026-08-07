import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db, outreachMessages, prospects, users } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { sendEmail } from "@/lib/resend";

// POST: Send an outreach message via email (Resend)
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { messageId } = body;

    if (!messageId) {
      return NextResponse.json({ error: "ID du message requis" }, { status: 400 });
    }

    // Get the message
    const msgRows = await db
      .select()
      .from(outreachMessages)
      .where(and(eq(outreachMessages.id, messageId), eq(outreachMessages.userId, user.id)))
      .limit(1);

    if (msgRows.length === 0) {
      return NextResponse.json({ error: "Message introuvable" }, { status: 404 });
    }
    const message = msgRows[0];

    // Get the prospect
    const prospectRows = await db
      .select()
      .from(prospects)
      .where(and(eq(prospects.id, message.prospectId), eq(prospects.userId, user.id)))
      .limit(1);

    if (prospectRows.length === 0) {
      return NextResponse.json({ error: "Prospect introuvable" }, { status: 404 });
    }
    const prospect = prospectRows[0];

    if (!prospect.email) {
      return NextResponse.json({ error: "Ce prospect n'a pas d'adresse email" }, { status: 400 });
    }

    // Get user's email for reply-to
    const userRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const userEmail = userRows[0]?.email || "";

    // Send the email via Resend
    const result = await sendEmail({
      to: prospect.email,
      subject: message.subject || "Contact professionnel",
      textContent: message.content,
      replyTo: userEmail,
      htmlContent: `<div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="white-space: pre-wrap; line-height: 1.6; color: #334155; font-size: 15px;">${message.content.replace(/\n/g, "<br>")}</div>
        <br>
        <p style="color: #94a3b8; font-size: 13px; border-top: 1px solid #f1f5f9; padding-top: 20px; margin-top: 30px;">
          Envoyé via LeadFlow AI
        </p>
      </div>`,
    });

    if (!result.success) {
      // Mark message as bounced
      await db
        .update(outreachMessages)
        .set({ status: "bounced" })
        .where(eq(outreachMessages.id, messageId));

      return NextResponse.json(
        { error: `Échec d'envoi: ${result.error}` },
        { status: 500 }
      );
    }

    // Mark message as sent
    await db
      .update(outreachMessages)
      .set({
        status: "sent",
        sentAt: new Date(),
      })
      .where(eq(outreachMessages.id, messageId));

    // Update prospect status
    await db
      .update(prospects)
      .set({ status: "contacted", updatedAt: new Date() })
      .where(eq(prospects.id, prospect.id));

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: prospect.email,
    });
  } catch (error) {
    console.error("Send outreach email error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
