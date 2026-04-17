"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { userNotifications } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/session";

export async function markAllNotificationsRead() {
  const user = await getCurrentUser();
  if (!user) return;
  await db
    .update(userNotifications)
    .set({ readAt: new Date() })
    .where(eq(userNotifications.userId, user.id));
  revalidatePath("/notifications");
}
