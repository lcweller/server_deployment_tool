import Link from "next/link";

import { NotificationSettingsForm } from "@/components/notification-settings-form";
import { PageHeader } from "@/components/page-header";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NotificationSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="Notification settings"
        description={
          <span>
            Choose channels per event type. In-app alerts are always on.{" "}
            <Link href="/notifications" className="text-primary underline">
              View notifications
            </Link>
          </span>
        }
      />
      <div className="mx-auto max-w-4xl flex-1 space-y-6 p-4 md:p-6">
        <NotificationSettingsForm />
      </div>
    </>
  );
}
