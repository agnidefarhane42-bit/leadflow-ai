// Resend email integration for LeadFlow AI
// Docs: https://resend.com/docs
// Free tier: 3000 emails/month, 100 emails/day

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.FROM_EMAIL || "outreach@leadflow.ai";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

interface SendEmailParams {
  to: string;
  subject: string;
  htmlContent?: string;
  textContent: string;
  replyTo?: string;
}

interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send an email via Resend API
 */
export async function sendEmail({ to, subject, htmlContent, textContent, replyTo }: SendEmailParams): Promise<SendEmailResult> {
  if (!RESEND_API_KEY) {
    // Dev mode — simulate success
    console.log(`[DEV EMAIL] To: ${to}, Subject: ${subject}`);
    console.log(`[DEV EMAIL] Body: ${textContent.substring(0, 200)}...`);
    return { success: true, messageId: `dev_${Date.now()}` };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to,
        subject,
        html: htmlContent || textContent.replace(/\n/g, "<br>"),
        text: textContent,
        reply_to: replyTo || undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Resend error (${response.status}): ${error}` };
    }

    const data = await response.json();
    return { success: true, messageId: data.id };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Send a notification email to the user (e.g., low credits, campaign completed)
 */
export async function sendNotificationEmail(
  userEmail: string,
  userName: string | null,
  subject: string,
  message: string
): Promise<SendEmailResult> {
  const greeting = userName ? `Bonjour ${userName},` : "Bonjour,";
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #6366f1, #7c3aed); padding: 30px; border-radius: 16px 16px 0 0; text-align: center;">
        <h1 style="color: white; margin: 0; font-size: 24px;">LeadFlow AI</h1>
      </div>
      <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 16px 16px;">
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">${greeting}</p>
        <p style="color: #475569; font-size: 16px; line-height: 1.6;">${message}</p>
        <div style="margin: 30px 0;">
          <a href="${APP_URL}/dashboard" style="background: linear-gradient(135deg, #6366f1, #7c3aed); color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">
            Aller au dashboard
          </a>
        </div>
        <p style="color: #94a3b8; font-size: 13px; margin-top: 30px; border-top: 1px solid #f1f5f9; padding-top: 20px;">
          LeadFlow AI — Agents IA de prospecting pour développeurs et agences
        </p>
      </div>
    </div>
  `;

  return sendEmail({
    to: userEmail,
    subject: `[LeadFlow AI] ${subject}`,
    htmlContent: html,
    textContent: `${greeting}\n\n${message}\n\nVoir votre dashboard: ${APP_URL}/dashboard`,
  });
}
