"use server";
import { revalidatePath } from "next/cache";
import { setTaskDue } from "@/lib/notion";

export async function setTaskDueAction(id: string, due: string) {
  await setTaskDue(id, due || null);
  revalidatePath("/", "layout");
}
