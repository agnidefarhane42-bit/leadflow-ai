// Gmail API integration for sending outreach emails
// Uses Google OAuth refresh token to send emails from the user's Gmail account
// Free: 500 emails/day via Gmail API

import { google } from "googleapis";
import dns from "dns";

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
 * RFC 2047 encode a header value if it contains non-ASCII characters
 * (fixes accented characters showing as mojibake in email clients)
 */
function encodeHeader(value: string): string {
  const hasNonAscii = /[^\x00-\x7F]/.test(value);
  if (!hasNonAscii) return value;
  const base64 = Buffer.from(value, "utf-8").toString("base64");
  return `=?UTF-8?B?${base64}?=`;
}

/**
 * Check if a domain has valid MX (mail) records — used to filter out
 * fake/AI-hallucinated email addresses before sending, to protect
 * Gmail sender reputation from bounces.
 */
export async function domainHasMailServer(email: string): Promise<boolean> {
  const domain = email.split("@")[1];
  if (!domain) return false;
  try {
    const records = await dns.promises.resolveMx(domain);
    return records.length > 0;
  } catch {
    return false;
  }
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

    // Encode text/html bodies as base64 to safely carry UTF-8 accented characters
    const textBase64 = Buffer.from(textContent, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");
    const htmlBody = htmlContent || textContent.replace(/\n/g, "<br>");
    const htmlBase64 = Buffer.from(htmlBody, "utf-8").toString("base64").replace(/(.{76})/g, "$1\r\n");

    // Build RFC 2822 email
    const boundary = "leadflow_boundary_" + Date.now();
    const lines = [
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      textBase64,
      "",
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      htmlBase64,
      "",
      `--${boundary}--`,
    ];

    if (replyTo) {
      lines.splice(2, 0, `Reply-To: ${replyTo}`);
    }

    const rawEmail = lines.join("\r\n");

    // Base64url encode the whole message for the Gmail API "raw" field
    const encodedMessage = Buffer.from(rawEmail, "utf-8")
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
