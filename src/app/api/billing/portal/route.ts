import { NextResponse } from "next/server";

import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const stripe = getStripe();
  if (!stripe || !auth.user.stripeCustomerId) {
    return NextResponse.json(
      { error: "No Stripe customer yet. Start a subscription from Billing." },
      { status: 400 }
    );
  }

  const returnUrl = `${process.env.APP_PUBLIC_URL ?? "http://localhost:3000"}/billing`;

  const session = await stripe.billingPortal.sessions.create({
    customer: auth.user.stripeCustomerId,
    return_url: returnUrl,
  });

  return NextResponse.json({ url: session.url });
}
