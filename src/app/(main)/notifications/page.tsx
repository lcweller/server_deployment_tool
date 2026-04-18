import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Bell } from "lucide-react";

import { markAllNotificationsRead } from "@/app/(main)/notifications/actions";
import { NotificationFeedItem } from "@/components/notification-feed-item";
import { RealtimeDashboardRefresh } from "@/components/realtime-dashboard-refresh";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  const rows = await db
    .select()
    .from(userNotifications)
    .where(eq(userNotifications.userId, user.id))
    .orderBy(desc(userNotifications.createdAt))
    .limit(200);

  const unreadCount = rows.filter((r) => r.readAt == null).length;

  return (
    <>
      <RealtimeDashboardRefresh />
      <PageHeader
        title="Notifications"
        description={
          <span>
            In-app alerts for hosts and game servers. Configure email and webhooks
            in{" "}
            <Link className="text-primary underline" href="/settings/notifications">
              notification settings
            </Link>
            .
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/settings/notifications"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Settings
            </Link>
            <form action={markAllNotificationsRead}>
              <Button
                type="submit"
                variant="secondary"
                size="sm"
                disabled={unreadCount === 0}
              >
                Mark all read
              </Button>
            </form>
          </div>
        }
      />

      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        {rows.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{unreadCount}</span>{" "}
            unread
            <span className="text-muted-foreground"> · </span>
            <span className="font-medium text-foreground">{rows.length}</span>{" "}
            total
          </p>
        ) : null}

        <Card className="border-border/80">
          {rows.length > 0 ? (
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Activity feed</CardTitle>
              <CardDescription>
                Newest first. Remove clears an entry from this list only.
              </CardDescription>
            </CardHeader>
          ) : null}
          <CardContent className="p-0">
            {rows.length === 0 ? (
              <div className="px-6 py-10 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
                  <Bell className="size-6" aria-hidden />
                </div>
                <p className="mt-4 text-sm font-medium text-foreground">
                  No notifications yet
                </p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                  When hosts connect, backups finish, or servers change state,
                  updates will show up here and on your dashboard.
                </p>
                <Link
                  href="/dashboard"
                  className={cn(
                    buttonVariants({ variant: "default", size: "sm" }),
                    "mt-6"
                  )}
                >
                  Back to dashboard
                </Link>
              </div>
            ) : (
              <ul className="border-t border-border/60">
                {rows.map((n) => (
                  <NotificationFeedItem
                    key={n.id}
                    id={n.id}
                    title={n.title}
                    message={n.message}
                    severity={n.severity}
                    createdAtIso={n.createdAt.toISOString()}
                    linkHref={n.linkHref}
                    readAtIso={n.readAt ? n.readAt.toISOString() : null}
                  />
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
