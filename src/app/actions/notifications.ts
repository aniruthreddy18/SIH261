"use server";
import { markNotificationsRead } from "@/server/notifications";
import { getActor } from "@/server/session";
import { revalidatePath } from "next/cache";

export async function markNotificationsReadAction(ids?: string[]) {
  const actor = await getActor();
  if (!actor) return;
  await markNotificationsRead(actor.userId, ids);
  revalidatePath("/", "layout");
}
