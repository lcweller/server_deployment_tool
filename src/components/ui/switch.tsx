"use client";

import { Switch } from "@base-ui/react/switch";

import { cn } from "@/lib/utils";

function SwitchRoot({ className, ...props }: Switch.Root.Props) {
  return (
    <Switch.Root
      data-slot="switch"
      className={cn(
        "peer inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-input/60 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <Switch.Thumb
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-background shadow-md ring-0 transition-transform duration-200 data-checked:translate-x-4 data-unchecked:translate-x-0.5"
        )}
      />
    </Switch.Root>
  );
}

export { SwitchRoot as Switch };
