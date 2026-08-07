import { db, creditBalances, creditTransactions } from "./db";
import { eq, sql } from "drizzle-orm";

// Initialize 10 free credits for a new user + signup_bonus transaction
export async function initializeUserCredits(userId: number) {
  // Create balance record
  await db.insert(creditBalances).values({
    userId,
    balance: 10,
  });

  // Record the signup bonus transaction
  await db.insert(creditTransactions).values({
    userId,
    amount: 10,
    type: "signup_bonus",
    description: "10 crédits de bienvenue offerts",
  });
}

// Get current balance for a user
export async function getBalance(userId: number): Promise<number> {
  const rows = await db
    .select()
    .from(creditBalances)
    .where(eq(creditBalances.userId, userId))
    .limit(1);

  return rows[0]?.balance ?? 0;
}

// Get transaction history for a user
export async function getTransactions(userId: number, limit = 20) {
  return db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.userId, userId))
    .orderBy(creditTransactions.createdAt)
    .limit(limit);
}

// Consume credits (for agent runs). Returns false if insufficient balance.
export async function consumeCredits(
  userId: number,
  amount: number,
  description: string,
  referenceId?: string
): Promise<boolean> {
  // Atomic check + decrement using a transaction-like approach
  const result = await db
    .update(creditBalances)
    .set({
      balance: sql`${creditBalances.balance} - ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(creditBalances.userId, userId))
    .returning();

  if (result.length === 0) {
    return false; // No balance record
  }

  const newBalance = result[0].balance;
  if (newBalance < 0) {
    // Rollback — user didn't have enough credits
    await db
      .update(creditBalances)
      .set({
        balance: sql`${creditBalances.balance} + ${amount}`,
        updatedAt: new Date(),
      })
      .where(eq(creditBalances.userId, userId));
    return false;
  }

  // Record the transaction
  await db.insert(creditTransactions).values({
    userId,
    amount: -amount,
    type: "agent_run",
    description,
    referenceId: referenceId || null,
  });

  return true;
}

// Add credits (for purchases)
export async function addCredits(
  userId: number,
  amount: number,
  description: string,
  referenceId?: string
): Promise<number> {
  // Try to update existing balance
  const result = await db
    .update(creditBalances)
    .set({
      balance: sql`${creditBalances.balance} + ${amount}`,
      updatedAt: new Date(),
    })
    .where(eq(creditBalances.userId, userId))
    .returning();

  if (result.length === 0) {
    // No balance record yet — create one
    await db.insert(creditBalances).values({
      userId,
      balance: amount,
    });
  }

  // Record the transaction
  await db.insert(creditTransactions).values({
    userId,
    amount,
    type: "purchase",
    description,
    referenceId: referenceId || null,
  });

  return result[0]?.balance ?? amount;
}

// Check if user has enough credits
export async function hasEnoughCredits(userId: number, amount: number): Promise<boolean> {
  const balance = await getBalance(userId);
  return balance >= amount;
}
