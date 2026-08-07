import { NextRequest, NextResponse } from "next/server";
import { signup, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password, fullName, company } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email et mot de passe requis" }, { status: 400 });
    }

    const result = await signup(email, password, fullName, company);

    if (result.error || !result.user) {
      return NextResponse.json({ error: result.error || "Erreur" }, { status: 400 });
    }

    const user = result.user;

    // Set session cookie (include role — new users are "user" by default)
    await setSessionCookie({
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      company: user.company,
      plan: user.plan,
      role: user.role || "user",
    });

    return NextResponse.json({ success: true, user: { id: user.id, email: user.email } });
  } catch (error) {
    console.error("Signup error:", error);
    return NextResponse.json({ error: "Erreur lors de l'inscription" }, { status: 500 });
  }
}
