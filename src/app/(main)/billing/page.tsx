import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { getStripe } from "@/lib/stripe";

import { BillingActions } from "./billing-actions";

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const stripe = getStripe();
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);
  const sub = subRows[0];

  return (
    <>
      <PageHeader
        title="Billing"
        description="Subscriptions via Stripe. Configure keys in production."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <Card className="max-w-xl border-border/80">
          <CardHeader>
            <CardTitle className="text-base">Subscription</CardTitle>
            <CardDescription>
              {stripe && process.env.STRIPE_PRICE_ID
                ? "Start or manage your plan."
                : "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID to enable checkout."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {sub ? (
              <div className="text-sm">
                <p>
                  Status:{" "}
                  <span className="font-medium text-foreground">{sub.status}</span>
                </p>
                {sub.currentPeriodEnd ? (
                  <p className="text-muted-foreground">
                    Current period ends{" "}
                    {sub.currentPeriodEnd.toLocaleString(undefined, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No active subscription on file.
              </p>
            )}
            <BillingActions hasStripeCustomer={Boolean(user.stripeCustomerId)} />
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">
          Webhook URL:{" "}
          <code className="rounded bg-muted px-1">
            {process.env.APP_PUBLIC_URL ?? "http://localhost:3000"}
            /api/webhooks/stripe
          </code>
        </p>
      </div>
    </>
  );
}
