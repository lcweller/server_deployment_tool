import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  searchParams?: Promise<{ reason?: string }>;
};

export default async function EmailVerifiedPage({ searchParams }: Props) {
  const sp = (await searchParams) ?? {};
  const reason = sp.reason;

  const isSuccess = !reason || reason === "";
  const title = isSuccess
    ? "Email verified"
    : reason === "expired"
      ? "Link expired"
      : reason === "missing"
        ? "Invalid link"
        : "Verification failed";

  const description = isSuccess
    ? "Your account is ready. You can sign in to Steamline."
    : reason === "expired"
      ? "This verification link has expired. Sign in and request a new one from the verification page."
      : reason === "missing"
        ? "Open the full link from your email, or request a new verification email."
        : "This link is invalid or was already used. Try signing in or request a new verification email.";

  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12">
      <Link
        href="/"
        className="mb-8 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="flex size-8 items-center justify-center rounded-md bg-primary text-xs font-semibold text-primary-foreground">
          S
        </span>
        Steamline
      </Link>
      <Card className="w-full max-w-md border-border/80 shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold tracking-tight">
            {title}
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Link
            href="/login"
            className={cn(buttonVariants({ size: "lg" }), "w-full justify-center")}
          >
            Go to sign in
          </Link>
          {!isSuccess ? (
            <p className="text-center text-xs text-muted-foreground">
              <Link href="/login" className="text-primary underline">
                Sign in
              </Link>{" "}
              if you already verified, or use &quot;Resend&quot; after signing in.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
