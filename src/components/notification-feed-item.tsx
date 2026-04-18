"use client";

import Link from "next/link";
import { Check, ExternalLink, Trash2 } from "lucide-react";

import {
  dismissNotification,
  markOneNotificationRead,
} from "@/app/(main)/notifications/actions";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/relative-time";
import {
  notificationSeverityBadgeVariant,
  notificationSeverityDotClass,
} from "@/lib/notification-severity";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  title: string;
  message: string;
  severity: string;
  createdAtIso: string;
  linkHref: string | null;
  readAtIso: string | null;
};

export function NotificationFeedItem({
  id,
  title,
  message,
  severity,
  createdAtIso,
  linkHref,
  readAtIso,
}: Props) {
  const unread = readAtIso == null;
  const createdAt = new Date(createdAtIso);
  const badgeVariant = notificationSeverityBadgeVariant(severity);
  const dotClass = notificationSeverityDotClass(severity);

  return (
    <li
      className={cn(
        "border-b border-border/60 last:border-b-0",
        unread ? "bg-muted/35" : "bg-background"
      )}
    >
      <div className="flex gap-3 p-4 text-sm">
        <span
          className={cn("mt-1.5 size-2 shrink-0 rounded-full", dotClass)}
          aria-hidden
        />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <div className="min-w-0 space-y-1">
              {linkHref ? (
                <Link
                  href={linkHref}
                  className="font-medium leading-snug text-primary hover:underline"
                >
                  {title}
                </Link>
              ) : (
                <p className="font-medium leading-snug text-foreground">{title}</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={badgeVariant} className="capitalize">
                  {severity}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  <time dateTime={createdAtIso} title={createdAt.toLocaleString()}>
                    {formatRelativeTime(createdAt)}
                  </time>
                </span>
                {unread ? (
                  <span className="text-[10px] font-medium text-primary">
                    Unread
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground">Read</span>
                )}
              </div>
            </div>
          </div>
          <p className="whitespace-pre-wrap text-muted-foreground">{message}</p>
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {linkHref ? (
              <Link
                href={linkHref}
                className={cn(
                  buttonVariants({ variant: "outline", size: "xs" }),
                  "gap-1"
                )}
              >
                Open
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : null}
            {unread ? (
              <form action={markOneNotificationRead} className="inline">
                <input type="hidden" name="id" value={id} />
                <Button
                  type="submit"
                  variant="ghost"
                  size="xs"
                  className="gap-1 text-muted-foreground"
                >
                  <Check className="size-3" aria-hidden />
                  Mark read
                </Button>
              </form>
            ) : null}
            <form action={dismissNotification} className="inline">
              <input type="hidden" name="id" value={id} />
              <Button
                type="submit"
                variant="ghost"
                size="xs"
                className="gap-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" aria-hidden />
                Remove
              </Button>
            </form>
          </div>
        </div>
      </div>
    </li>
  );
}
