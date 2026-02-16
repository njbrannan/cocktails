type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

type SendEmailResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

function getResendConfig() {
  const apiKey = process.env.RESEND_API_KEY || "";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "";
  const fromName = process.env.RESEND_FROM_NAME || "Get Involved Catering";
  const adminEmail = process.env.ADMIN_EMAIL || "";

  return { apiKey, fromEmail, fromName, adminEmail };
}

function extractEmailAddress(value: string) {
  // Accept either "email@domain.com" or "Name <email@domain.com>"
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] || value).trim();
}

function formatFromHeader(fromEmail: string, fromName: string) {
  const email = (fromEmail || "").trim();
  if (!email) return "";

  // Already formatted like "Name <email@domain.com>"
  if (email.includes("<") && email.includes(">")) return email;

  const name = (fromName || "").trim();
  return name ? `${name} <${email}>` : email;
}

export function isEmailConfigured() {
  const { apiKey, fromEmail } = getResendConfig();
  return Boolean(apiKey && fromEmail);
}

export async function sendEmail(args: SendEmailArgs): Promise<SendEmailResult> {
  const { apiKey, fromEmail, fromName } = getResendConfig();
  const from = formatFromHeader(fromEmail, fromName);

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
    const body = await response.text().catch(() => "");
    return {
      ok: false as const,
      error: body || `HTTP ${response.status}`,
    };
  }

  // Resend typically returns: { id: "..." }
  const json = await response.json().catch(() => null);
  const id = json && typeof json.id === "string" ? json.id : undefined;
  return { ok: true as const, id };
}

export function getAdminEmail() {
  const { adminEmail, fromEmail } = getResendConfig();
  // If ADMIN_EMAIL isn't set, default to the configured "from" mailbox.
  // This prevents "missing admin email" from silently dropping notifications.
  return extractEmailAddress(adminEmail || fromEmail);
}
