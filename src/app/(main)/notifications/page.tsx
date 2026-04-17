import Link from "next/link";

import { markAllNotificationsRead } from "@/app/(main)/notifications/actions";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth/session";
import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { desc, eq } from "drizzle-orm";

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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <form action={markAllNotificationsRead}>
          <Button type="submit" variant="secondary" size="sm">
            Mark all read
          </Button>
        </form>
      </div>
      <ul className="divide-border divide-y rounded-md border">
        {rows.length === 0 ? (
          <li className="text-muted-foreground p-6 text-sm">No notifications yet.</li>
        ) : (
          rows.map((n) => (
            <li
              key={n.id}
              className={`flex flex-col gap-1 p-4 text-sm ${!n.readAt ? "bg-muted/40" : ""}`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{n.title}</span>
                <span className="text-muted-foreground text-xs">
                  {n.severity} · {new Date(n.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="text-muted-foreground whitespace-pre-wrap">{n.message}</p>
              {n.linkHref ? (
                <Link href={n.linkHref} className="text-primary text-xs underline">
                  Open
                </Link>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
