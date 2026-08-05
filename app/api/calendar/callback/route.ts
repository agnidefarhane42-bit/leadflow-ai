import { NextRequest, NextResponse } from "next/server";
import { google } from "googleapis";

// Google Calendar OAuth callback
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.json({ error: `OAuth error: ${error}` }, { status: 400 });
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

    // In production, store these tokens in your database
    // For now, return them so they can be saved
    return NextResponse.json({
      success: true,
      message: "Google Calendar connected successfully!",
      tokens: {
        access_token: tokens.access_token ? "[received]" : null,
        refresh_token: tokens.refresh_token ? "[received]" : null,
        expiry_date: tokens.expiry_date,
      },
    });
  } catch (error) {
    console.error("Calendar OAuth callback error:", error);
    return NextResponse.json({ error: "Failed to exchange code for tokens" }, { status: 500 });
  }
}
