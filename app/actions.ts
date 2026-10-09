"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { env, has, connectedAccounts, type Account } from "@/lib/config";
import { COOKIE, sessionToken, safeEqual } from "@/lib/auth";
import { addBusinessDays, todayISO } from "@/lib/dates";
import * as N from "@/lib/notion";
import * as G from "@/lib/google";
import { draftFirstEmail, extractActionItems, humanize, type ProposedTask } from "@/lib/claude";
import { runDaily } from "@/lib/agents";

const refresh = () => revalidatePath("/", "layout");

/* ---------- auth ---------- */

export async function login(_: unknown, fd: FormData) {
  const pw = String(fd.get("password") ?? "");
  if (!env.password || !safeEqual(pw, env.password)) return { error: "That's not it." };
  const jar = await cookies();
  jar.set(COOKIE, await sessionToken(env.sessionSecret), { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
  const next = String(fd.get("next") || "/");
  redirect(next.startsWith("/") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}

/* ---------- tasks ---------- */

export async function toggleTask(id: string, done: boolean) {
  await N.setTaskDone(id, done);
  if (done && has.google()) await G.removeEvent(`task:${id}`).catch(() => {});
  refresh();
}

export async function setTaskStatus(id: string, status: string) {
  await N.setTaskStatus(id, status);
  if (status === "Done" && has.google()) await G.removeEvent(`task:${id}`).catch(() => {});
  refresh();
}

export async function snoozeTask(id: string, days: number) {
  await N.setTaskDue(id, addBusinessDays(todayISO(), days));
  refresh();
}

export async function addTask(fd: FormData) {
  const title = String(fd.get("title") ?? "").trim();
  if (!title) return;
  await N.createTask({
    title,
    workstream: (fd.get("workstream") as string) || null,
    phase: (fd.get("phase") as string) || null,
    due: (fd.get("due") as string) || null,
    details: String(fd.get("details") ?? ""),
  });
  refresh();
}

/* ---------- outreach ---------- */

export type ComposeState = { ok?: string; error?: string };

export async function sendOutreach(_: ComposeState, fd: FormData): Promise<ComposeState> {
  const to = String(fd.get("to") ?? "").trim();
  const subject = humanize(String(fd.get("subject") ?? ""));
  const body = humanize(String(fd.get("body") ?? ""));
  const center = String(fd.get("center") ?? "").trim();
  const outreachId = (fd.get("outreachId") as string) || undefined;
  const existingNotes = String(fd.get("existingNotes") ?? "");
  const mode = String(fd.get("mode") ?? "send");
  const from = (String(fd.get("from") ?? "") as Account) || G.defaultSendFrom();
  if (!connectedAccounts().includes(from)) return { error: "That sending account isn't connected. See Connections." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { error: "That email address doesn't look right." };
  if (!center) return { error: "Add the center name so it lands in Notion." };
  if (!subject || !body) return { error: "Subject and message are both needed." };
  if (!has.google()) return { error: "Google isn't connected yet. See Settings." };

  try {
    if (mode === "draft") {
      await G.createDraft(from, { to, subject, body });
      return { ok: `Saved to your Gmail drafts. It'll show up under "Waiting for your OK" once ${center} is in Notion.` };
    }
    await G.sendEmail(from, { to, subject, body });
    const today = todayISO();
    await N.recordOutreachSend({
      id: outreachId,
      center,
      contact: String(fd.get("contact") ?? ""),
      sentTo: to,
      dateSent: today,
      followUpOn: addBusinessDays(today, env.followUpDays),
      framing: "Cash-pay patients (new)",
      note: `First email sent from ${await G.myEmail(from)}: "${subject}"`,
      existingNotes,
    });
    refresh();
    return { ok: `Sent to ${to}. Logged in Notion with a follow-up on ${addBusinessDays(today, env.followUpDays)}.` };
  } catch (e: any) {
    return { error: e?.message ?? "Something went wrong sending that." };
  }
}

export async function aiFirstDraft(center: string, contact: string, notes: string, ask: string) {
  if (!has.claude()) return { error: "Add ANTHROPIC_API_KEY to use drafting." };
  try {
    return await draftFirstEmail({ center, contact, notes, ask });
  } catch (e: any) {
    return { error: e?.message ?? "Drafting failed." };
  }
}

const acctOf = (fd: FormData): Account => {
  const a = String(fd.get("account")) as Account;
  if (!connectedAccounts().includes(a)) throw new Error("Unknown account");
  return a;
};

export async function approveDraft(fd: FormData) {
  const id = String(fd.get("draftId"));
  const account = acctOf(fd);
  const to = String(fd.get("to"));
  const subject = humanize(String(fd.get("subject") ?? ""));
  const body = humanize(String(fd.get("body") ?? ""));
  const threadId = (fd.get("threadId") as string) || undefined;
  const inReplyTo = (fd.get("inReplyTo") as string) || undefined;
  await G.updateDraft(account, id, { to, subject, body, threadId, inReplyTo });
  await G.sendDraft(account, id);

  const rows = await N.getOutreach();
  const row = rows.find((r) => r.sentTo?.toLowerCase() === to.toLowerCase());
  if (row) {
    await N.appendOutreachNote(row.id, row.notes, "Follow-up sent");
    await N.setOutreachFollowUp(row.id, addBusinessDays(todayISO(), env.followUpDays));
    await G.removeEvent(`fu:${row.id}`).catch(() => {});
  }
  refresh();
}

export async function discardDraft(fd: FormData) {
  await G.deleteDraft(acctOf(fd), String(fd.get("draftId")));
  refresh();
}

export async function setOutreachStatus(id: string, status: string) {
  await N.setOutreachStatus(id, status);
  if (status !== "Sent" && status !== "No response") {
    await N.setOutreachFollowUp(id, null);
    if (has.google()) await G.removeEvent(`fu:${id}`).catch(() => {});
  }
  refresh();
}

/* ---------- calls ---------- */

export async function logCall(fd: FormData) {
  const id = String(fd.get("id"));
  const outcome = String(fd.get("outcome")) as "reached" | "voicemail" | "meeting" | "dead";
  const existing = await N.getTarget(id);
  let callback = (fd.get("callback") as string) || null;
  if (outcome === "voicemail" && !callback) callback = addBusinessDays(todayISO(), 2);
  await N.logCall(id, existing, {
    outcome,
    answeredBy: String(fd.get("answeredBy") ?? ""),
    notes: String(fd.get("notes") ?? ""),
    nextStep: String(fd.get("nextStep") ?? ""),
    callback,
  });
  if (has.google()) {
    if (callback) await G.upsertAllDayEvent(`cb:${id}`, callback, `Ripe callback: ${existing.center}`, `${existing.phone ?? ""}`).catch(() => {});
    else await G.removeEvent(`cb:${id}`).catch(() => {});
  }
  refresh();
}

/* ---------- content ---------- */

export async function setPostStatus(id: string, status: string) {
  await N.setPostStatus(id, status);
  refresh();
}
export async function setPostDate(id: string, d: string) {
  await N.setPostDate(id, d || null);
  refresh();
}

/* ---------- research triage ---------- */

export type TriageResult = { summary?: string; tasks?: ProposedTask[]; error?: string };

export async function triageResearch(research: string): Promise<TriageResult> {
  if (!has.claude()) return { error: "Add ANTHROPIC_API_KEY in Vercel to turn on research triage." };
  if (research.trim().length < 40) return { error: "Paste a bit more. This works best with a full Claude answer or set of notes." };
  try {
    const open = await N.getTasks();
    return await extractActionItems(research, todayISO(), open.map((t) => t.title));
  } catch (e: any) {
    return { error: e?.message ?? "Triage failed." };
  }
}

export async function acceptTriage(input: { tasks: ProposedTask[]; title: string; research: string; summary: string; saveNote: boolean }) {
  let noteUrl: string | null = null;
  if (input.saveNote && input.title.trim()) {
    noteUrl = await N.saveResearchNote(input.title.trim(), `**Summary:** ${input.summary}\n\n---\n\n${input.research}`);
  }
  for (const t of input.tasks) {
    await N.createTask({
      title: t.title,
      workstream: t.workstream,
      phase: t.phase,
      due: t.due,
      details: `${t.details}${noteUrl ? `\nSource: ${noteUrl}` : ""}`,
    });
  }
  refresh();
  return { created: input.tasks.length, noteUrl };
}

/* ---------- agents ---------- */

export async function runAgentsNow() {
  const r = await runDaily();
  refresh();
  return r;
}
