// Gmail API integration for sending outreach emails
// Uses Google OAuth refresh token to send emails from the user's Gmail account
// Free: 500 emails/day via Gmail API

import { google } from "googleapis";

interface SendGmailParams {
  to: string;
  subject: string;
  textContent: string;
  htmlContent?: string;
  replyTo?: string;
  refreshToken: string;
}

interface SendGmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Get an OAuth2 client with a refresh token
 */
function getOAuth2Client(refreshToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/callback`
  );

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });

  return oauth2Client;
}

/**
 * Send an email via Gmail API using the user's refresh token
 */
export async function sendGmail({ to, subject, textContent, htmlContent, replyTo, refreshToken }: SendGmailParams): Promise<SendGmailResult> {
  if (!refreshToken) {
    return { success: false, error: "Gmail non connecté. Connectez votre compte Google pour envoyer des emails." };
  }

  try {
    const oauth2Client = getOAuth2Client(refreshToken);
    const gmail = google.gmail({ version: "v1", auth: oauth2Client });

    // Build RFC 2822 email
    const boundary = "leadflow_boundary_" + Date.now();
    const fromEmail = replyTo || "me";
    const lines = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 7bit",
      "",
      textContent,
      "",
      `--${boundary}`,
      'Content-Type: text/html; charset=UTF-8',
      "Content-Transfer-Encoding: 7bit",
      "",
      htmlContent || textContent.replace(/\n/g, "<br>"),
      "",
      `--${boundary}--`,
    ];

    if (replyTo) {
      lines.splice(2, 0, `Reply-To: ${replyTo}`);
    }

    const rawEmail = lines.join("\r\n");

    // Base64url encode
    const encodedMessage = Buffer.from(rawEmail)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: encodedMessage,
      },
    });

    return { success: true, messageId: result.data.id || undefined };
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown Gmail error";
    console.error("[GMAIL ERROR]", msg);
    return { success: false, error: msg };
  }
}
