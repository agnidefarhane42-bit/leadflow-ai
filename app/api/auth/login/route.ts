import { NextRequest, NextResponse } from "next/server";
import { login, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const result = await login(email, password);

    if (result.error || !result.user) {
      return NextResponse.json({ error: result.error || "Erreur" }, { status: 401 });
    }

    const user = result.user;

    // Set session cookie (include role)
    await setSessionCookie({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      company: user.company,
      plan: user.plan,
      role: user.role || "user",
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email, role: user.role } });
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json({ error: "Erreur de connexion" }, { status: 500 });
  }
}
