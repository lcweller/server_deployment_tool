"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { TurnstileField } from "@/components/turnstile-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function loginErrorMessage(status: number, raw?: string): string {
  if (status === 401) {
    return "Invalid email or password.";
  }
  if (raw?.toLowerCase().includes("captcha")) {
    return "Security check failed. Try again.";
  }
  return "Something went wrong. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") || "/dashboard";
  const verified = searchParams.get("verified");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        user?: { emailVerified?: boolean };
      };
      if (!res.ok) {
        setError(loginErrorMessage(res.status, data.error));
        return;
      }
      if (data.user && !data.user.emailVerified) {
        router.push("/verify-email");
        router.refresh();
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card className="w-full max-w-md border-border/80 bg-card/95 shadow-lg backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl font-bold tracking-tight">Log in</CardTitle>
        <CardDescription className="text-sm">
          Sign in to manage your hosts and game servers.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          {verified === "1" ? (
            <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
              Email verified. You can sign in.
            </p>
          ) : null}
          {verified === "invalid_token" || verified === "expired_token" ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {verified === "expired_token"
                ? "That link expired. Request a new one from the verification page."
                : "Invalid verification link."}
            </p>
          ) : null}
          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="login-email">Email</Label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="login-password">Password</Label>
              <span className="text-xs text-muted-foreground">Forgot password — coming soon</span>
            </div>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="login-captcha">Security check</Label>
            <TurnstileField
              onToken={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-border/60 bg-muted/20">
          <Button type="submit" className="w-full" size="lg" pending={pending}>
            Log in
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
