import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const balance = await getBalance(user.id);

    return NextResponse.json({
      user: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
        role: user.role,
        plan: user.plan,
      },
      balance,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
