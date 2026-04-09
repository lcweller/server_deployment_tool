import Link from "next/link";
import { Suspense } from "react";

import { RegisterForm } from "./register-form";

function RegisterFallback() {
  return (
    <div className="h-[400px] w-full max-w-md animate-pulse rounded-xl border border-border/60 bg-card/50" />
  );
}

export default function RegisterPage() {
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
      <Suspense fallback={<RegisterFallback />}>
        <RegisterForm />
      </Suspense>
    </div>
  );
}
