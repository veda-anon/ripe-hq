import "server-only";
import { env, has } from "./config";
import { addDays, todayISO, weekBounds } from "./dates";
import * as N from "./notion";
import * as G from "./google";

export type Today = Awaited<ReturnType<typeof loadToday>>;

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T, errors: string[]): Promise<T> {
  try {
    return await fn();
  } catch (e: any) {
    errors.push(`${label}: ${e?.message ?? e}`);
    return fallback;
  }
}

/** Everything the Today view and the morning brief need, in one pass. */
export async function loadToday() {
  const today = todayISO();
  const soon = addDays(today, 3);
  const week = weekBounds(today);
  const errors: string[] = [];

  // Local preview only: DEMO_FILE points at a JSON snapshot so the UI can be checked without credentials.
  const demo = process.env.DEMO_FILE ? JSON.parse(await (await import("node:fs/promises")).readFile(process.env.DEMO_FILE, "utf8")) : null;

  if (!has.notion() && !demo) {
    return { today, ready: false as const, errors: ["NOTION_TOKEN is not set"] };
  }

  const [tasks, outreach, callbacks, callQueue, content] = demo ? [demo.tasks, demo.outreach, demo.callbacks, demo.callQueue, demo.content] as [N.Task[], N.Outreach[], N.Target[], N.Target[], N.Post[]] : await Promise.all([
    safe("Execution Tasks", () => N.getTasks(), [] as N.Task[], errors),
    safe("Outreach", () => N.getOutreach(), [] as N.Outreach[], errors),
    safe("Callbacks", () => N.getCallbacks(), [] as N.Target[], errors),
    safe("Call queue", () => N.getCallQueue(5), [] as N.Target[], errors),
    safe("Content Tracker", () => N.getContent(), [] as N.Post[], errors),
  ]);

  const overdue = tasks.filter((t) => t.due && t.due.slice(0, 10) < today);
  const dueToday = tasks.filter((t) => t.due && t.due.slice(0, 10) === today);
  const dueSoon = tasks.filter((t) => t.due && t.due.slice(0, 10) > today && t.due.slice(0, 10) <= soon);
  const inProgress = tasks.filter((t) => t.status === "In progress" && !overdue.includes(t) && !dueToday.includes(t));
  // "Next steps": what actually needs attention, capped so it never becomes another wall
  const upcoming = tasks.filter((t) => t.due && t.due.slice(0, 10) > soon);
  let focus = [...overdue, ...dueToday, ...inProgress, ...dueSoon].filter((t, i, a) => a.indexOf(t) === i);
  // Never show an empty-feeling list: top up with the next dated tasks so there are about 5
  if (focus.length < 5) focus = [...focus, ...upcoming.slice(0, 5 - focus.length)];
  focus = focus.slice(0, 7);

  const followUps = N.followUpsDue(outreach, today);
  const callbacksDue = callbacks.filter((c) => !c.callback || c.callback.slice(0, 10) <= today);
  const replied = outreach.filter((o) => o.status === "Replied");

  const contentThisWeek = content.filter((p) => p.postDate && p.postDate.slice(0, 10) >= week.start && p.postDate.slice(0, 10) <= week.end);
  const contentUnscheduled = content.filter((p) => !p.postDate && p.status !== "Posted");

  let drafts: G.Draft[] = [];
  let waitlist: G.WaitlistStats | null = null;
  if (has.google()) {
    const emails = outreach.map((o) => o.sentTo).filter(Boolean) as string[];
    drafts = await safe("Gmail drafts", () => G.listDraftsTo(emails), [], errors);
    if (env.waitlistSheetId) waitlist = await safe("Waitlist sheet", () => G.getWaitlistStats(env.waitlistSheetId!), null, errors);
  }

  return {
    today, week, ready: true as const, errors,
    tasks, focus, overdue, dueToday, dueSoon,
    outreach, followUps, replied, drafts,
    callbacks: callbacksDue, callQueue,
    content, contentThisWeek, contentUnscheduled,
    waitlist,
    stats: {
      open: tasks.length,
      overdue: overdue.length,
      dueSoon: dueToday.length + dueSoon.length,
      outreachSent: outreach.filter((o) => o.dateSent).length,
      followUps: followUps.length,
      replies: replied.length,
      meetings: outreach.filter((o) => o.status === "Meeting").length,
      contentPosted: content.filter((p) => p.status === "Posted").length,
      contentTotal: content.length,
    },
  };
}
