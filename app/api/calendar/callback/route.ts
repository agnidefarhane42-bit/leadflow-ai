import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";
import { getCurrentUser } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { eq } from "drizzle-orm";

// Google OAuth callback (Calendar + Gmail)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/dashboard?google_error=${encodeURIComponent(error)}`, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
  }

  if (!code) {
    return NextResponse.json({ error: "Authorization code missing" }, { status: 400 });
  }

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
    );

    const { tokens } = await oauth2Client.getToken(code);

    // Get current user and store refresh token in DB
    const user = await getCurrentUser();
    if (user && tokens.refresh_token) {
      await db
        .update(users)
        .set({ googleRefreshToken: tokens.refresh_token })
        .where(eq(users.id, user.id));
    }

    // Redirect to dashboard with success message
    return NextResponse.redirect(
      new URL("/dashboard?google_connected=true", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      new URL("/dashboard?google_error=callback_failed", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000")
    );
  }
}
