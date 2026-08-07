import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { addCredits } from "@/lib/credits";
import { db, creditTransactions } from "@/lib/db";
import { eq } from "drizzle-orm";
import { createFedapayPayment, CREDIT_BUNDLES } from "@/lib/fedapay";

// POST: Initiate a credit purchase via Fedapay
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await req.json();
    const { credits } = body;

    // Find matching bundle
    const bundle = CREDIT_BUNDLES.find((b) => b.credits === credits);
    if (!bundle) {
      return NextResponse.json({ error: "Bundle invalide" }, { status: 400 });
    }

    // Check if Fedapay is configured
    if (!process.env.FEDAPAY_SECRET_KEY) {
      // Development mode — add credits directly (no payment)
      if (process.env.NODE_ENV === "development") {
        const newBalance = await addCredits(
          user.id,
          bundle.credits,
          `Achat (${bundle.label}) — Mode développement`,
        );

        return NextResponse.json({
          success: true,
          mode: "development",
          message: "Crédits ajoutés en mode développement (sans paiement)",
          balance: newBalance,
        });
      }

      return NextResponse.json(
        { error: "Le paiement n'est pas encore configuré. Contactez l'administrateur." },
        { status: 503 }
      );
    }

    // Create Fedapay transaction
    const payment = await createFedapayPayment({
      amount: bundle.priceFCFA,
      credits: bundle.credits,
      userId: user.id,
      userEmail: user.email,
      userName: user.fullName || "",
    });

    // Store pending transaction
    await db.insert(creditTransactions).values({
      userId: user.id,
      amount: bundle.credits,
      type: "purchase",
      description: `Achat ${bundle.label} (${bundle.credits} crédits) — En attente de paiement`,
      referenceId: payment.reference,
    });

    return NextResponse.json({
      success: true,
      mode: "production",
      checkoutUrl: payment.checkoutUrl,
      transactionId: payment.transactionId,
      reference: payment.reference,
    });
  } catch (error) {
    console.error("Create payment error:", error);
    return NextResponse.json({ error: "Erreur lors de la création du paiement" }, { status: 500 });
  }
}

// GET: List available bundles
export async function GET() {
  return NextResponse.json({
    bundles: CREDIT_BUNDLES,
    fedapayPublicKey: process.env.FEDAPAY_PUBLIC_KEY || null,
    isConfigured: !!process.env.FEDAPAY_SECRET_KEY,
  });
}
