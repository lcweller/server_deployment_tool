import Link from "next/link";

import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Notification settings</h1>
        <p className="text-muted-foreground text-sm">
          Choose channels per event type. In-app alerts are always on.{" "}
          <Link href="/notifications" className="text-primary underline">
            View notifications
          </Link>
        </p>
      </div>
      <NotificationSettingsForm />
    </div>
  );
}
