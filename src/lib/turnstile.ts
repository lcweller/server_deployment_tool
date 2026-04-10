/**
 * Cloudflare Turnstile server-side verification.
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */

type TurnstileVerifyResponse = {
  success: boolean;
  "error-codes"?: string[];
};

function skipTurnstileByEnv(): boolean {
  const v = process.env.STEAMLINE_SKIP_TURNSTILE?.toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export async function verifyTurnstileToken(token: string | null | undefined) {
  if (skipTurnstileByEnv()) {
    if (process.env.NODE_ENV === "production") {
      console.warn(
        "[turnstile] STEAMLINE_SKIP_TURNSTILE is set — captcha verification disabled (self-hosted only)"
      );
    }
    return true;
  }

  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "TURNSTILE_SECRET_KEY is required in production (or set STEAMLINE_SKIP_TURNSTILE=1 to disable captcha for self-hosting)"
      );
    }
    console.warn(
      "[turnstile] TURNSTILE_SECRET_KEY not set — skipping verification (dev only)"
    );
    return true;
  }

  if (!token || typeof token !== "string") {
    return false;
  }

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", token);

  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }
  );

  if (!res.ok) {
    return false;
  }

  const data = (await res.json()) as TurnstileVerifyResponse;
  return data.success === true;
}
