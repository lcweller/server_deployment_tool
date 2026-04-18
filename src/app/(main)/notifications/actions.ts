"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

function revalidateNotificationSurfaces() {
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(eq(userNotifications.userId, user.id));
  revalidateNotificationSurfaces();
}

export async function markOneNotificationRead(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const raw = formData.get("id");
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return;
  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(
      and(eq(userNotifications.id, id), eq(userNotifications.userId, user.id))
    );
  revalidateNotificationSurfaces();
}

export async function dismissNotification(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) return;
  const raw = formData.get("id");
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!id) return;
  await db
    .delete(userNotifications)
    .where(
      and(eq(userNotifications.id, id), eq(userNotifications.userId, user.id))
    );
  revalidateNotificationSurfaces();
}
