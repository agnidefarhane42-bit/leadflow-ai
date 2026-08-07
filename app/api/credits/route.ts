import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBalance, getTransactions } from "@/lib/credits";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const balance = await getBalance(user.id);
    const transactions = await getTransactions(user.id);

    return NextResponse.json({
      balance,
      transactions,
    });
  } catch (error) {
    console.error("Get credits error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
