import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Account and preferences for GameServerOS. Email and name are shown as registered on your account."
      />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="flex max-w-xl flex-col gap-6">
          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>
                Your display name and sign-in email (read-only here).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="display-name">Name</Label>
                <Input
                  id="display-name"
                  type="text"
                  readOnly
                  value={user.displayName ?? ""}
                  placeholder="—"
                  className="bg-muted/40"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  readOnly
                  value={user.email}
                  className="bg-muted/40"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Notifications</CardTitle>
              <CardDescription>
                Email and webhook delivery for host and server events.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link
                href="/settings/notifications"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-auto w-full justify-between gap-2 py-2.5 pr-2 font-normal"
                )}
              >
                <span className="text-left text-sm font-medium text-foreground">
                  Notification channels
                </span>
                <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
              </Link>
              <Link
                href="/notifications"
                className={cn(
                  buttonVariants({ variant: "ghost", size: "sm" }),
                  "h-auto w-full justify-between gap-2 py-2.5 pr-2 font-normal text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="text-left text-sm">In-app inbox</span>
                <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Billing</CardTitle>
              <CardDescription>Subscription and Stripe customer portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/billing"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "h-auto w-full justify-between gap-2 py-2.5 pr-2 font-normal"
                )}
              >
                <span className="text-left text-sm font-medium text-foreground">
                  Manage billing
                </span>
                <ChevronRight className="size-4 shrink-0 opacity-60" aria-hidden />
              </Link>
            </CardContent>
          </Card>

          <Card className="border-border/80">
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>
                Password, sessions, and optional 2FA — planned.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Password change, email verification, and Turnstile will hook into
                this section.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
