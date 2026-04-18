"use client";

import { Checkbox } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

function CheckboxRoot({
  className,
  ...props
}: Checkbox.Root.Props) {
  return (
    <Checkbox.Root
      data-slot="checkbox"
      className={cn(
        "peer flex size-4 shrink-0 items-center justify-center rounded border border-input bg-transparent outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30",
        className
      )}
      {...props}
    >
      <Checkbox.Indicator
        className={cn(
          "[&>svg]:size-3",
          "data-[unchecked]:hidden"
        )}
      >
        <Check strokeWidth={3} />
      </Checkbox.Indicator>
    </Checkbox.Root>
  );
}

export { CheckboxRoot as Checkbox };
