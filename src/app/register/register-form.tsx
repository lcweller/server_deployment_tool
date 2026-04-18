"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

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

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function registerErrorMessage(raw?: string): string {
  if (!raw) return "Something went wrong. Please try again.";
  const t = raw.toLowerCase();
  if (t.includes("captcha")) {
    return "Security check failed. Try again.";
  }
  if (t.includes("already exists")) {
    return "An account with this email already exists. Try logging in.";
  }
  if (t.includes("send email") || t.includes("smtp")) {
    return "Account created but we couldn’t send email. Check server mail settings or use resend from the verification page.";
  }
  return raw;
}

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
    confirm?: string;
  }>({});
  const [pending, setPending] = useState(false);

  const passwordHint = useMemo(() => {
    if (password.length === 0) return null;
    if (password.length < 8) {
      return "Use at least 8 characters.";
    }
    return null;
  }, [password]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const trimmedName = name.trim();
    if (trimmedName.length < 1) {
      setError("Please enter your name.");
      return;
    }

    const em = email.trim();
    const next: typeof fieldErrors = {};
    if (!EMAIL_RE.test(em)) {
      next.email = "Enter a valid email address.";
    }

    if (password.length < 8) {
      next.password = "Password must be at least 8 characters.";
    }

    if (password !== confirm) {
      next.confirm = "Passwords do not match.";
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          email: em,
          password,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(registerErrorMessage(data.error));
        return;
      }
      router.push("/verify-email");
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
        <CardTitle className="text-2xl font-bold tracking-tight">
          Create account
        </CardTitle>
        <CardDescription className="text-sm">
          Choose a display name and password. We&apos;ll email you a verification
          link before you add hosts.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="reg-name">Name</Label>
            <Input
              id="reg-name"
              type="text"
              autoComplete="name"
              placeholder="Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
            />
            <p className="text-xs text-muted-foreground">
              Shown in the dashboard — you can change it later.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-email">Email</Label>
            <Input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {fieldErrors.email ? (
              <p className="text-xs text-destructive">{fieldErrors.email}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-password">Password</Label>
            <Input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
            />
            {fieldErrors.password ? (
              <p className="text-xs text-destructive">{fieldErrors.password}</p>
            ) : passwordHint ? (
              <p className="text-xs text-destructive">{passwordHint}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                At least 8 characters. Use a mix of letters and numbers for a
                stronger password.
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-confirm">Confirm password</Label>
            <Input
              id="reg-confirm"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
            {fieldErrors.confirm ? (
              <p className="text-xs text-destructive">{fieldErrors.confirm}</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="reg-captcha">Security check</Label>
            <TurnstileField
              onToken={setTurnstileToken}
              onExpire={() => setTurnstileToken(null)}
            />
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-4 border-t border-border/60 bg-muted/20">
          <Button type="submit" className="w-full" size="lg" pending={pending}>
            Create account
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
