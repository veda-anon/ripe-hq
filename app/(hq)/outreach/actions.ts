"use server";
import { revalidatePath } from "next/cache";
import { setOutreachFollowUp } from "@/lib/notion";

export async function setFollowUpAction(id: string, d: string) {
  await setOutreachFollowUp(id, d || null);
  revalidatePath("/", "layout");
}
