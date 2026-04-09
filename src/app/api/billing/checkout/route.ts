import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { requireVerifiedUser } from "@/lib/auth/require-verified";
import { getStripe } from "@/lib/stripe";

export async function POST() {
  const auth = await requireVerifiedUser();
  if ("error" in auth) {
    return auth.error;
  }

  const stripe = getStripe();
  const priceId = process.env.STRIPE_PRICE_ID;
  const successUrl = `${process.env.APP_PUBLIC_URL ?? "http://localhost:3000"}/billing?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${process.env.APP_PUBLIC_URL ?? "http://localhost:3000"}/billing?canceled=1`;

  if (!stripe || !priceId) {
    return NextResponse.json(
      { error: "Billing is not configured (STRIPE_SECRET_KEY, STRIPE_PRICE_ID)." },
      { status: 503 }
    );
  }

  let customerId = auth.user.stripeCustomerId ?? undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: auth.user.email,
      metadata: { userId: auth.user.id },
    });
    customerId = customer.id;
    await db
      .update(users)
      .set({ stripeCustomerId: customerId, updatedAt: new Date() })
      .where(eq(users.id, auth.user.id));
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    client_reference_id: auth.user.id,
    metadata: { userId: auth.user.id },
  });

  return NextResponse.json({ url: session.url });
}
