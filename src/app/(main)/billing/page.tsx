import Link from "next/link";
import { eq } from "drizzle-orm";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
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

function subscriptionStatusBadgeVariant(
  status: string
): "success" | "warning" | "destructive" | "secondary" | "info" {
  switch (status) {
    case "active":
    case "trialing":
      return "success";
    case "past_due":
    case "unpaid":
      return "destructive";
    case "canceled":
    case "incomplete_expired":
      return "secondary";
    case "incomplete":
      return "warning";
    default:
      return "info";
  }
}

export default async function BillingPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const stripe = getStripe();
  const canCheckout = Boolean(stripe && process.env.STRIPE_PRICE_ID);

  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);
  const sub = subRows[0];

  const publicBase =
    process.env.APP_PUBLIC_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

  return (
    <>
      <PageHeader
        title="Billing"
        description={
          <span>
            Subscriptions and invoices via Stripe.{" "}
            <Link className="text-primary underline" href="/settings">
              Account settings
            </Link>
          </span>
        }
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex max-w-xl flex-col gap-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
              <CardDescription>
                {canCheckout
                  ? "Start a plan or open the customer portal to manage payment methods and invoices."
                  : "Set STRIPE_SECRET_KEY and STRIPE_PRICE_ID to enable checkout in this environment."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {sub ? (
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant={subscriptionStatusBadgeVariant(sub.status)}
                      className="capitalize"
                    >
                      {sub.status.replace(/_/g, " ")}
                    </Badge>
                  </div>
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
                  No subscription on file yet.
                </p>
              )}
              <BillingActions
                hasStripeCustomer={Boolean(user.stripeCustomerId)}
                canCheckout={canCheckout}
              />
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Stripe webhooks</CardTitle>
              <CardDescription>
                Point this URL at your Stripe dashboard so subscription events
                stay in sync.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <code className="block break-all rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-xs">
                {publicBase}/api/webhooks/stripe
              </code>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
