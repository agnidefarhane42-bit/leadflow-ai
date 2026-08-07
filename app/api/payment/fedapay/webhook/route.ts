import { NextRequest, NextResponse } from "next/server";
import { db, creditTransactions, creditBalances } from "@/lib/db";
import { eq, sql } from "drizzle-orm";
import { addCredits } from "@/lib/credits";
import { verifyFedapayTransaction } from "@/lib/fedapay";

// Fedapay webhook — called when payment status changes
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Fedapay sends an event object
    const event = body.event || body;
    const transaction = event.transaction || event.data?.transaction || body;

    // Extract transaction ID
    const transactionId = String(transaction.id || event.id || body.id);
    if (!transactionId) {
      return NextResponse.json({ error: "No transaction ID" }, { status: 400 });
    }

    // Verify the transaction with Fedapay API
    let verified;
    try {
      verified = await verifyFedapayTransaction(transactionId);
    } catch {
      // If verification fails, try to process from webhook data
      const status = transaction.status || event.status;
      const metadata = transaction.metadata || event.metadata || {};

      if (status !== "approved" && status !== "completed") {
        return NextResponse.json({ received: true, status: "not_approved" });
      }

      return await processPayment(metadata, transactionId);
    }

    // Only process approved payments
    if (verified.status !== "approved" && verified.status !== "completed") {
      return NextResponse.json({ received: true, status: verified.status });
    }

    return await processPayment(verified.metadata, transactionId);
  } catch (error) {
    console.error("Fedapay webhook error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

async function processPayment(metadata: any, transactionId: string) {
  const userId = parseInt(metadata.userId);
  const credits = parseInt(metadata.credits);

  if (!userId || !credits) {
    return NextResponse.json({ error: "Invalid metadata" }, { status: 400 });
  }

  // Check if this transaction was already processed (idempotency)
  const existing = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.referenceId, transactionId))
    .limit(1);

  if (existing.length > 0 && existing[0].type === "purchase" && existing[0].amount > 0) {
    // Already processed — skip
    return NextResponse.json({ received: true, status: "already_processed" });
  }

  // Add the credits
  const newBalance = await addCredits(
    userId,
    credits,
    `Achat confirmé (${credits} crédits) — Transaction ${transactionId}`,
    transactionId,
  );

  return NextResponse.json({
    received: true,
    status: "approved",
    creditsAdded: credits,
    newBalance,
  });
}
