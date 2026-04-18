import type { Metadata } from "next";
import { Suspense } from "react";

import { AuthShell } from "@/components/auth-shell";

import { RegisterForm } from "./register-form";

export const metadata: Metadata = {
  title: "Create account",
  description:
    "Create your GameServerOS account to pair machines and deploy dedicated game servers.",
};

function RegisterFallback() {
  return (
    <div className="h-[560px] w-full max-w-md animate-pulse rounded-lg border border-border/60 bg-card/50" />
  );
}

export default function RegisterPage() {
  return (
    <AuthShell>
      <Suspense fallback={<RegisterFallback />}>
        <RegisterForm />
      </Suspense>
    </AuthShell>
  );
}
