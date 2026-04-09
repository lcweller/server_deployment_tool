import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";

import { db } from "@/db";
import { subscriptions, users } from "@/db/schema";
import { getStripe } from "@/lib/stripe";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const stripe = getStripe();
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !whSecret) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const sig = request.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const raw = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, whSecret);
  } catch (e) {
    return NextResponse.json(
      { error: `Webhook signature: ${String(e)}` },
      { status: 400 }
    );
  }

  switch (event.type) {
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await db
        .delete(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, sub.id));
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId =
        typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.stripeCustomerId, customerId))
        .limit(1);
      const user = userRows[0];
      if (!user) {
        break;
      }

      const item0 = sub.items.data[0];
      const priceId = item0?.price?.id ?? null;
      const status = sub.status;
      const currentPeriodEnd = item0?.current_period_end
        ? new Date(item0.current_period_end * 1000)
        : null;

      if (status === "canceled" || status === "unpaid") {
        await db
          .delete(subscriptions)
          .where(eq(subscriptions.userId, user.id));
        break;
      }

      const existing = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(subscriptions)
          .set({
            stripeSubscriptionId: sub.id,
            status,
            priceId,
            currentPeriodEnd,
            updatedAt: new Date(),
          })
          .where(eq(subscriptions.id, existing[0].id));
      } else {
        await db.insert(subscriptions).values({
          userId: user.id,
          stripeCustomerId: customerId,
          stripeSubscriptionId: sub.id,
          status,
          priceId,
          currentPeriodEnd,
        });
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
