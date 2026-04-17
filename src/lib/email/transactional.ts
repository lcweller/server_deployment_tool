/**
 * Transactional email — set RESEND_API_KEY (dashboard env) and optionally per-user key in
 * notification settings. Implementations should use Resend HTTP API or nodemailer.
 */
export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
};

export async function sendTransactionalEmail(
  email: TransactionalEmail,
  opts: { apiKey?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = opts.apiKey?.trim() || process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error:
        "Email not configured: set RESEND_API_KEY on the server or add a Resend API key in notification settings.",
    };
  }
  const from = process.env.RESEND_FROM?.trim() || "Steamline <onboarding@resend.dev>";
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: email.to,
        subject: email.subject,
        text: email.text,
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { ok: false, error: t || `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Email send failed",
    };
  }
}
