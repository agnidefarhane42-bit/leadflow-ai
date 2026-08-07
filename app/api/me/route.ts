import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBalance } from "@/lib/credits";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const balance = await getBalance(user.id);

    const userRows = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
    const userInfo = userRows[0];
    const googleConnected = !!userInfo?.googleRefreshToken;
    const apolloConnected = !!userInfo?.apolloApiKey;

    return NextResponse.json({
      user: {
        email: user.email,
        fullName: user.fullName,
        company: user.company,
        role: user.role,
        plan: user.plan,
        apolloApiKey: userInfo?.apolloApiKey || null,
      },
      balance,
      googleConnected,
      apolloConnected,
    });
  } catch {
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
