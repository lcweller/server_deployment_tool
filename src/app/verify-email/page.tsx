import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth/session";

import { ResendVerificationButton } from "./resend-button";
import { SignOutButton } from "./sign-out-button";

export default async function VerifyEmailPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  if (user.emailVerifiedAt) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          G
        </span>
        GameServerOS
      </Link>
      <Card className="w-full max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            Check your email
          </CardTitle>
          <CardDescription>
            We sent a verification link to{" "}
            <span className="font-medium text-foreground">{user.email}</span>.
            Click the link to activate your account. Links expire in 48 hours.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ResendVerificationButton />
          <SignOutButton />
          <p className="text-center text-xs text-muted-foreground">
            Wrong inbox? Sign out and register with a different email.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
