"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { Button } from "./button";

function DialogRoot({ ...props }: Dialog.Root.Props) {
  return <Dialog.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: Dialog.Trigger.Props) {
  return <Dialog.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogBackdrop({
  className,
  ...props
}: Dialog.Backdrop.Props) {
  return (
    <Dialog.Backdrop
      data-slot="dialog-backdrop"
      className={cn(
        "fixed inset-0 z-50 bg-black/55 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-sm",
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: Dialog.Popup.Props & { showCloseButton?: boolean }) {
  return (
    <Dialog.Portal>
      <DialogBackdrop />
      <Dialog.Viewport className="fixed inset-0 z-50 grid place-items-center p-4">
        <Dialog.Popup
          data-slot="dialog-content"
          className={cn(
            "relative z-50 w-full max-w-lg rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg outline-none transition duration-200 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton ? (
            <Dialog.Close
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute top-3 right-3"
                  aria-label="Close"
                />
              }
            >
              <XIcon className="size-4" />
            </Dialog.Close>
          ) : null}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  );
}

function DialogTitle({ className, ...props }: Dialog.Title.Props) {
  return (
    <Dialog.Title
      data-slot="dialog-title"
      className={cn("text-lg font-semibold leading-none tracking-tight", className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ...props
}: Dialog.Description.Props) {
  return (
    <Dialog.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

function DialogClose({ ...props }: Dialog.Close.Props) {
  return <Dialog.Close data-slot="dialog-close" {...props} />;
}

export {
  DialogRoot as Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
