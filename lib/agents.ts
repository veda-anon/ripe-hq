import "server-only";
import { env, has } from "./config";
import { addDays, daysBetween, fmtLong, fmtShort, relative, todayISO } from "./dates";
import * as N from "./notion";
import * as G from "./google";
import { draftFollowUp } from "./claude";
import { loadToday, type Today } from "./data";

export type AgentReport = { lines: string[]; errors: string[] };

/**
 * Follow-up agent.
 * 1. Checks Gmail for replies from every clinic still marked Sent / No response. Replies flip the row to Replied in Notion.
 * 2. For rows whose follow-up date has arrived with no reply, writes a threaded follow-up as a Gmail DRAFT.
 *    Nothing is sent. Drafts show up in the dashboard for approval.
 * 3. After two follow-ups with no reply, marks the row "No response" and stops.
 */
export async function runFollowUpAgent(): Promise<AgentReport> {
  const r: AgentReport = { lines: [], errors: [] };
  if (!has.notion() || !has.google()) {
    r.errors.push("Follow-up agent needs Notion and Google connected.");
    return r;
  }
  const today = todayISO();
  const rows = await N.getOutreach();
  const waiting = rows.filter((o) => o.sentTo && o.dateSent && (o.status === "Sent" || o.status === "No response"));
  const existingDrafts = await G.listDraftsTo(waiting.map((o) => o.sentTo!));
  const draftedFor = new Set(existingDrafts.map((d) => d.to));

  for (const o of waiting) {
    try {
      const reply = await G.findReply(o.sentTo!, o.dateSent!);
      if (reply) {
        await N.setOutreachStatus(o.id, "Replied");
        await N.appendOutreachNote(o.id, o.notes, `Reply received: "${reply.snippet.slice(0, 160)}"`);
        await G.removeEvent(`fu:${o.id}`).catch(() => {});
        r.lines.push(`Reply from ${o.center}. Marked Replied in Notion.`);
        continue;
      }
      const due = o.followUpOn && o.followUpOn.slice(0, 10) <= today;
      if (!due || draftedFor.has(o.sentTo!.toLowerCase())) continue;
      if (!has.claude()) {
        r.errors.push("ANTHROPIC_API_KEY not set, so follow-up drafts were skipped.");
        break;
      }

      const sentCount = (o.notes.match(/Follow-up sent/g) ?? []).length;
      if (sentCount >= 2) {
        await N.setOutreachStatus(o.id, "No response");
        await N.setOutreachFollowUp(o.id, null);
        r.lines.push(`${o.center}: two follow-ups with no reply. Marked No response and stopped.`);
        continue;
      }

      const last = await G.lastSentTo(o.sentTo!);
      const body = await draftFollowUp({
        center: o.center,
        contact: o.contact,
        previousSubject: last?.subject ?? "",
        previousBody: last?.body ?? "",
        daysSince: daysBetween(o.dateSent!.slice(0, 10), today),
        framing: o.framing,
        notes: o.notes,
        followUpNumber: sentCount + 1,
      });
      const subject = last?.subject ? (/^re:/i.test(last.subject) ? last.subject : `Re: ${last.subject}`) : `Following up: Ripe and ${o.center}`;
      // Draft in the same mailbox the original went out from, so it threads correctly
      const acct = last?.account ?? G.defaultSendFrom();
      await G.createDraft(acct, { to: o.sentTo!, subject, body, threadId: last?.threadId, inReplyTo: last?.messageId || undefined });
      await N.appendOutreachNote(o.id, o.notes, "Follow-up draft written by agent, waiting for approval");
      r.lines.push(`Drafted follow-up #${sentCount + 1} for ${o.center}.`);
    } catch (e: any) {
      r.errors.push(`${o.center}: ${e?.message ?? e}`);
    }
  }
  if (!r.lines.length) r.lines.push("No new replies, and no follow-ups due today.");
  return r;
}

/** Puts due tasks, follow-ups and callbacks on Google Calendar so Instinct and Muse see them. */
export async function syncCalendar(d: Extract<Today, { ready: true }>): Promise<AgentReport> {
  const r: AgentReport = { lines: [], errors: [] };
  if (!has.google()) return r;
  const horizon = addDays(d.today, 7);
  let n = 0;
  const jobs: [string, string, string, string][] = [];
  for (const t of d.tasks) {
    if (!t.due) continue;
    const day = t.due.slice(0, 10) < d.today ? d.today : t.due.slice(0, 10); // overdue items roll to today
    if (day > horizon) continue;
    jobs.push([`task:${t.id}`, day, `Ripe: ${t.title}`, `${t.workstream ?? ""} · ${t.phase ?? ""}\n${t.details}\n\nNotion: ${t.url}`]);
  }
  for (const o of d.followUps) {
    jobs.push([`fu:${o.id}`, d.today, `Ripe follow-up: ${o.center}`, `Emailed ${fmtShort(o.dateSent)} to ${o.sentTo}. A draft follow-up is waiting in Ripe HQ for approval. Don't send anything on my behalf.`]);
  }
  for (const c of d.callbacks) {
    jobs.push([`cb:${c.id}`, c.callback && c.callback.slice(0, 10) > d.today ? c.callback.slice(0, 10) : d.today, `Ripe callback: ${c.center}`, `${c.phone ?? ""}\n${c.nextStep}\n${c.notes}`]);
  }
  for (const [key, day, title, desc] of jobs.slice(0, 40)) {
    try {
      await G.upsertAllDayEvent(key, day, title, desc);
      n++;
    } catch (e: any) {
      r.errors.push(`Calendar ${title}: ${e?.message ?? e}`);
      break;
    }
  }
  r.lines.push(`Calendar: ${n} Ripe items on your calendar for the next 7 days.`);
  return r;
}

function bullet(items: string[], empty = "Nothing.") {
  return items.length ? items.map((i) => `• ${i}`).join("\n") : empty;
}

/** Plain-text brief. Used for the morning email and the assistant context doc. */
export function buildBrief(d: Extract<Today, { ready: true }>, agentLines: string[] = []): string {
  const top3 = d.focus.slice(0, 3).map((t) => `${t.title} (${relative(t.due, d.today) || t.status})`);
  const rest = d.focus.slice(3).map((t) => `${t.title} (${relative(t.due, d.today) || t.status})`);
  const wl = d.waitlist
    ? `${d.waitlist.total} total, ${d.waitlist.last7} in the last 7 days. Top sources: ${Object.entries(d.waitlist.bySource).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(", ")}.`
    : "Not connected yet.";

  return `RIPE HQ · ${fmtLong(d.today)}

TOP 3 TODAY
${bullet(top3, "Nothing overdue or due. Pick one Phase 1 prep task.")}

ALSO ON DECK
${bullet(rest)}

SUPPLY (clinics)
• ${d.followUps.length} email follow-ups due, ${d.drafts.length} drafts waiting for your OK
• ${d.callbacks.length} callbacks due
• ${d.stats.replies} replied, ${d.stats.meetings} meetings so far
${d.callQueue.length ? `• Next calls: ${d.callQueue.slice(0, 3).map((c) => `${c.center} (${c.city})`).join("; ")}` : ""}

DEMAND (content + waitlist)
• This week: ${d.contentThisWeek.length ? d.contentThisWeek.map((p) => `${p.title} [${p.status}]`).join("; ") : "nothing has a post date yet"}
• ${d.contentUnscheduled.length} posts still need a date
• Waitlist: ${wl}

AGENTS OVERNIGHT
${bullet(agentLines, "Nothing to report.")}

Open Ripe HQ: ${env.appUrl}`;
}

/** Longer context written into a Google Doc that Instinct / Muse can read through your Google account. */
function contextDoc(d: Extract<Today, { ready: true }>, brief: string): string {
  const openByPhase: Record<string, string[]> = {};
  for (const t of d.tasks) (openByPhase[t.phase ?? "Unphased"] ??= []).push(`${t.title}${t.due ? ` (due ${fmtShort(t.due)})` : ""}`);
  return `RIPE HQ: CONTEXT FOR MY ASSISTANTS
Last updated ${d.today}. This doc is rewritten every morning by Ripe HQ. Notion is the source of truth.

WHO I AM AND WHAT I'M DOING
I'm ${env.senderName}, founder of Ripe (ripe.care). Ripe helps people get cash-pay MRIs at independent imaging centers without the insurance runaround. I'm validating in NYC and NJ. Supply side is imaging centers; demand side is consumers via TikTok/Instagram content and the ripe.care waitlist.

HOW TO HELP ME
• Treat items starting with "Ripe:" on my calendar as my real priorities for that day.
• Do not email or call imaging centers on my behalf. Clinic emails go out from Ripe HQ after I approve them.
• Good help: reminding me of the top 3 below, protecting time on my calendar for them, nudging me when a callback is due, and keeping personal errands out of my way on heavy days.
• Phase dates: Phase 0 desk research Oct 7 to 20; Phase 1 discovery Oct 21 to Nov 17; Phase 2 concierge pilot Nov 18 to Dec 29; Phase 3 only if the Dec 29 gate passes.

TODAY
${brief}

ALL OPEN TASKS BY PHASE
${Object.entries(openByPhase).map(([p, ts]) => `${p}\n${bullet(ts)}`).join("\n\n")}

CLINIC PIPELINE
${bullet(d.outreach.filter((o) => o.status && o.status !== "Dead").slice(0, 40).map((o) => `${o.center}: ${o.status}${o.followUpOn ? `, follow up ${fmtShort(o.followUpOn)}` : ""}`))}
`;
}

/** The daily job: follow-up agent, then calendar sync, then the brief to email + assistant doc. */
export async function runDaily(): Promise<AgentReport> {
  const report: AgentReport = { lines: [], errors: [] };
  const fu = await runFollowUpAgent().catch((e) => ({ lines: [], errors: [String(e?.message ?? e)] }));
  report.lines.push(...fu.lines);
  report.errors.push(...fu.errors);

  const d = await loadToday();
  if (!d.ready) {
    report.errors.push(...d.errors);
    return report;
  }
  report.errors.push(...d.errors);

  const cal = await syncCalendar(d);
  report.lines.push(...cal.lines);
  report.errors.push(...cal.errors);

  const brief = buildBrief(d, fu.lines);
  if (has.google()) {
    try {
      const acct = G.assistantAccount();
      const me = await G.myEmail(acct);
      const subject = `Ripe HQ · ${fmtShort(d.today)}: ${d.focus[0]?.title ?? "clear day"}`;
      await G.sendEmail(acct, { to: me, subject, body: brief, cc: env.assistantEmail || undefined });
      report.lines.push(`Morning brief emailed to ${me}${env.assistantEmail ? ` and ${env.assistantEmail}` : ""}.`);
    } catch (e: any) {
      report.errors.push(`Brief email: ${e?.message ?? e}`);
    }
    try {
      const id = await G.writeContextDoc(contextDoc(d, brief), env.contextDocId);
      report.lines.push(`Assistant context doc updated (https://docs.google.com/document/d/${id}).`);
    } catch (e: any) {
      report.errors.push(`Context doc: ${e?.message ?? e}`);
    }
  }
  return report;
}
