import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Sign in to GameServerOS to manage your hosts and game servers.",
};

function LoginFallback() {
  return (
    <div className="h-[480px] w-full max-w-md animate-pulse rounded-lg border border-border/60 bg-card/50" />
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  );
}
