"use client";

import { useEffect, useState } from "react";

const QUIPS = [
  "Calibrating the hamsters…",
  "Collecting RAM fluid samples…",
  "Asking the CPU how its day is going…",
  "Negotiating with the disk platters…",
  "Teaching packets to line up politely…",
  "Measuring thermal vibes…",
  "Counting electrons (rounded to three decimals)…",
  "Reticulating splines, but for servers…",
  "Bribing the scheduler with coffee…",
  "Almost there — probably…",
] as const;

export function MetricsLoadingQuips() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = window.setInterval(
      () => setI((n) => (n + 1) % QUIPS.length),
      4200
    );
    return () => window.clearInterval(t);
  }, []);
  return (
    <p
      className="min-h-[2.5rem] text-xs leading-relaxed text-muted-foreground transition-opacity duration-300"
      key={i}
    >
      {QUIPS[i]}
    </p>
  );
}
