import "server-only";

import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST ?? "localhost";
  const port = Number(process.env.SMTP_PORT ?? "1025");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const from = process.env.SMTP_FROM ?? "Steamline <noreply@localhost>";

  await getTransport().sendMail({
    from,
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    html: opts.html ?? opts.text.replace(/\n/g, "<br/>"),
  });
}

/**
 * Base URL for links in emails (verification, etc.). Must match the URL users use in the browser.
 * In Docker/production, set `APP_PUBLIC_URL` (e.g. https://steamline.example.com) — no trailing slash.
 *
 * Uses `process.env["APP_PUBLIC_URL"]` so the value is read at **runtime** in Docker (not inlined at `next build`).
 */
export function publicAppUrl() {
  const raw =
    typeof process !== "undefined"
      ? process.env["APP_PUBLIC_URL"]?.trim() ||
        process.env["NEXT_PUBLIC_APP_URL"]?.trim()
      : "";
  if (raw) {
    return raw.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[steamline] APP_PUBLIC_URL is not set — email links use http://localhost:3000. Set APP_PUBLIC_URL to your public https URL (e.g. in the Steamline container env)."
    );
  }
  return "http://localhost:3000";
}
