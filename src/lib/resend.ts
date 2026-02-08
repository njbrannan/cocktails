type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const from = process.env.RESEND_FROM_EMAIL || "";
  const adminEmail = process.env.ADMIN_EMAIL || "";

  return { apiKey, from, adminEmail };
}

function extractEmailAddress(value: string) {
  // Accept either "email@domain.com" or "Name <email@domain.com>"
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

export function isEmailConfigured() {
  const { apiKey, from } = getResendConfig();
  return Boolean(apiKey && from);
}

export async function sendEmail(args: SendEmailArgs) {
  const { apiKey, from } = getResendConfig();

  if (!apiKey || !from) {
    // Don't crash requests if email isn't configured yet.
    return { ok: false as const, error: "Email not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      ...(args.replyTo ? { replyTo: args.replyTo } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    return { ok: false as const, error: body || `HTTP ${response.status}` };
  }

  return { ok: true as const };
}

export function getAdminEmail() {
  const { adminEmail, from } = getResendConfig();
  // If ADMIN_EMAIL isn't set, default to the configured "from" mailbox.
  // This prevents "missing admin email" from silently dropping notifications.
  return extractEmailAddress(adminEmail || from);
}
