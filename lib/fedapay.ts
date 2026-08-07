// Fedapay integration for LeadFlow AI
// Docs: https://fedapay.docs.apiary.io/
// Fedapay supports Mobile Money (MTN, Moov, Orange), card, and bank transfer

const FEDAPAY_API_URL = process.env.FEDAPAY_API_URL || "https://api.fedapay.com/v1";
const FEDAPAY_API_KEY = process.env.FEDAPAY_API_KEY;
const FEDAPAY_PUBLIC_KEY = process.env.FEDAPAY_PUBLIC_KEY;

interface CreatePaymentParams {
  amount: number; // In FCFA
  credits: number; // Number of credits to add
  userId: number;
  userEmail: string;
  userName: string;
}

interface FedapayTransaction {
  id: number;
  reference: string;
  status: string; // pending, approved, declined, canceled
  amount: number;
  callback_url: string;
  checkout_url: string;
}

/**
 * Create a Fedapay payment transaction
 * Returns the checkout URL where the user pays
 */
export async function createFedapayPayment({
  amount,
  credits,
  userId,
  userEmail,
  userName,
}: CreatePaymentParams): Promise<{ checkoutUrl: string; transactionId: string; reference: string }> {
  if (!FEDAPAY_API_KEY) {
    throw new Error("FEDAPAY_API_KEY is not set");
  }

  const reference = `LF-${userId}-${Date.now()}`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const response = await fetch(`${FEDAPAY_API_URL}/transactions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FEDAPAY_API_KEY}`,
    },
    body: JSON.stringify({
      transaction: {
        amount: amount * 100, // Fedapay uses smallest currency unit (like kobo/cents)
        description: `Achat de ${credits} crédits - LeadFlow AI`,
        callback_url: `${appUrl}/api/payment/fedapay/webhook`,
        currency: { iso: "XOF" },
        customer: {
          email: userEmail,
          firstname: userName || "Client",
          lastname: "",
        },
        metadata: {
          userId: String(userId),
          credits: String(credits),
          reference,
          product: "leadflow-credits",
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Fedapay API error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const transaction = data.transaction || data;

  // Generate a payment token/link for checkout
  const tokenResponse = await fetch(`${FEDAPAY_API_URL}/transactions/${transaction.id}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${FEDAPAY_API_KEY}`,
    },
    body: JSON.stringify({
      token: {
        transaction_id: transaction.id,
      },
    }),
  });

  if (!tokenResponse.ok) {
    // If token generation fails, use the transaction URL directly
    const checkoutUrl = transaction.checkout_url || `${appUrl}/billing?status=pending&ref=${reference}`;
    return { checkoutUrl, transactionId: String(transaction.id), reference };
  }

  const tokenData = await tokenResponse.json();
  const token = tokenData.token || tokenData.access_token || tokenData.key;
  const checkoutUrl = token
    ? `${FEDAPAY_API_URL.replace("api.", "checkout.")}/checkout/${token}`
    : transaction.checkout_url || `${appUrl}/billing?status=pending&ref=${reference}`;

  return {
    checkoutUrl,
    transactionId: String(transaction.id),
    reference,
  };
}

/**
 * Verify a Fedapay transaction status
 * Called by the webhook to confirm payment and add credits
 */
export async function verifyFedapayTransaction(transactionId: string): Promise<{
  status: string;
  amount: number;
  metadata: {
    userId: string;
    credits: string;
    reference: string;
  };
}> {
  if (!FEDAPAY_API_KEY) {
    throw new Error("FEDAPAY_API_KEY is not set");
  }

  const response = await fetch(`${FEDAPAY_API_URL}/transactions/${transactionId}`, {
    headers: {
      Authorization: `Bearer ${FEDAPAY_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Fedapay verification failed (${response.status})`);
  }

  const data = await response.json();
  const transaction = data.transaction || data;

  return {
    status: transaction.status, // approved, pending, declined, canceled
    amount: transaction.amount,
    metadata: transaction.metadata || {},
  };
}

/**
 * Get Fedapay public key for frontend widgets
 */
export function getFedapayPublicKey(): string | null {
  return FEDAPAY_PUBLIC_KEY || null;
}
