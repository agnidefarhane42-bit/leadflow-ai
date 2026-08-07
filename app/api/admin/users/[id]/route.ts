import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { db, users, creditBalances, creditTransactions } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

// PATCH: Update a user (role, plan, credits)
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const userId = parseInt(params.id);
    const body = await req.json();
    const { role, plan, creditAmount } = body;

    const updateData: any = { updatedAt: new Date() };
    if (role !== undefined) updateData.role = role;
    if (plan !== undefined) updateData.plan = plan;

    if (role !== undefined || plan !== undefined) {
      await db.update(users).set(updateData).where(eq(users.id, userId));
    }

    // Add credits if requested
    if (creditAmount && creditAmount > 0) {
      const result = await db
        .update(creditBalances)
        .set({
          balance: sql`${creditBalances.balance} + ${creditAmount}`,
          updatedAt: new Date(),
        })
        .where(eq(creditBalances.userId, userId))
        .returning();

      if (result.length === 0) {
        await db.insert(creditBalances).values({ userId, balance: creditAmount });
      }

      await db.insert(creditTransactions).values({
        userId,
        amount: creditAmount,
        type: "admin_grant",
        description: `Crédits accordés par l'admin (${admin.email})`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin update user error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE: Delete a user (cannot delete self or other admins)
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const admin = await requireAdmin();
    if (!admin) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const userId = parseInt(params.id);

    // Can't delete yourself
    if (userId === admin.id) {
      return NextResponse.json({ error: "Vous ne pouvez pas supprimer votre propre compte" }, { status: 400 });
    }

    // Check target isn't admin
    const targetRows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (targetRows.length === 0) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }
    if (targetRows[0].role === "admin") {
      return NextResponse.json({ error: "Impossible de supprimer un admin" }, { status: 400 });
    }

    await db.delete(users).where(eq(users.id, userId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin delete user error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
