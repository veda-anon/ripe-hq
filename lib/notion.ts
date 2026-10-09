import "server-only";
import { Client } from "@notionhq/client";
import { cache } from "react";
import { DS, env } from "./config";
import { todayISO } from "./dates";

let _client: Client | null = null;
function notion(): Client {
  if (!env.notionToken) throw new Error("NOTION_TOKEN is not set");
  if (!_client) _client = new Client({ auth: env.notionToken });
  return _client;
}

/* ---------------- reading helpers ---------------- */

type Props = Record<string, any>;
type Row = { id: string; url: string; props: Props };

async function queryAll(dataSourceId: string, body: { filter?: any; sorts?: any[] } = {}, max = 500): Promise<Row[]> {
  const out: Row[] = [];
  let cursor: string | undefined;
  do {
    const res: any = await (notion() as any).dataSources.query({
      data_source_id: dataSourceId,
      page_size: 100,
      start_cursor: cursor,
      ...body,
    });
    for (const p of res.results) {
      if (p.object === "page") out.push({ id: p.id, url: p.url, props: p.properties });
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

const text = (p: any): string => {
  if (!p) return "";
  const arr = p.title ?? p.rich_text;
  if (Array.isArray(arr)) return arr.map((t: any) => t.plain_text).join("");
  return "";
};
const sel = (p: any): string | null => p?.select?.name ?? p?.status?.name ?? null;
const multi = (p: any): string[] => (p?.multi_select ?? []).map((o: any) => o.name);
const date = (p: any): string | null => p?.date?.start ?? null;
const check = (p: any): boolean => !!p?.checkbox;
const num = (p: any): number | null => (typeof p?.number === "number" ? p.number : null);
const email = (p: any): string | null => p?.email ?? null;
const url = (p: any): string | null => p?.url ?? null;
const phone = (p: any): string | null => p?.phone_number ?? null;

/* ---------------- writing helpers ---------------- */

const rt = (s: string) => [{ type: "text" as const, text: { content: s.slice(0, 2000) } }];
const W = {
  title: (s: string) => ({ title: rt(s) }),
  text: (s: string) => ({ rich_text: s ? rt(s) : [] }),
  select: (s: string | null) => ({ select: s ? { name: s } : null }),
  date: (s: string | null) => ({ date: s ? { start: s } : null }),
  check: (b: boolean) => ({ checkbox: b }),
  email: (s: string | null) => ({ email: s || null }),
};

async function update(pageId: string, properties: Props) {
  await notion().pages.update({ page_id: pageId, properties });
}

/* ---------------- Execution Tasks ---------------- */

export type Task = {
  id: string; url: string; title: string; status: string | null; done: boolean;
  due: string | null; phase: string | null; workstream: string | null; details: string;
};

export async function getTasks(opts: { includeDone?: boolean } = {}): Promise<Task[]> {
  const rows = await queryAll(DS.tasks, {
    filter: opts.includeDone ? undefined : { property: "Done", checkbox: { equals: false } },
    sorts: [{ property: "Due date", direction: "ascending" }],
  });
  return rows
    .map((r) => ({
      id: r.id, url: r.url,
      title: text(r.props["Task"]),
      status: sel(r.props["Status"]),
      done: check(r.props["Done"]),
      due: date(r.props["Due date"]),
      phase: sel(r.props["Phase"]),
      workstream: sel(r.props["Workstream"]),
      details: text(r.props["Details"]),
    }))
    .filter((t) => opts.includeDone || t.status !== "Done");
}

export async function setTaskDone(id: string, done: boolean) {
  await update(id, { Done: W.check(done), Status: W.select(done ? "Done" : "Not started") });
}
export async function setTaskStatus(id: string, status: string) {
  await update(id, { Status: W.select(status), Done: W.check(status === "Done") });
}
export async function setTaskDue(id: string, due: string | null) {
  await update(id, { "Due date": W.date(due) });
}
export async function createTask(t: { title: string; workstream?: string | null; phase?: string | null; due?: string | null; details?: string }) {
  const properties: Props = {
    Task: W.title(t.title),
    Status: W.select("Not started"),
    Done: W.check(false),
  };
  if (t.workstream) properties.Workstream = W.select(t.workstream);
  if (t.phase) properties.Phase = W.select(t.phase);
  if (t.due) properties["Due date"] = W.date(t.due);
  if (t.details) properties.Details = W.text(t.details);
  const page: any = await notion().pages.create({ parent: { data_source_id: DS.tasks }, properties } as any);
  return page.id as string;
}

/* ---------------- Email outreach (Confirmed NYC / NJ Outreach) ---------------- */

export type Outreach = {
  id: string; url: string; center: string; contact: string; contactType: string | null;
  sentTo: string | null; dateSent: string | null; followUpOn: string | null; status: string | null;
  framing: string | null; nextContact: string; notes: string; website: string | null;
};

export const getOutreach = cache(async function getOutreach(): Promise<Outreach[]> {
  const rows = await queryAll(DS.outreach, { sorts: [{ property: "Follow Up On", direction: "ascending" }] });
  return rows.map((r) => ({
    id: r.id, url: r.url,
    center: text(r.props["Center"]),
    contact: text(r.props["Contact"]),
    contactType: sel(r.props["Contact Type"]),
    sentTo: email(r.props["Sent To"]),
    dateSent: date(r.props["Date Sent"]),
    followUpOn: date(r.props["Follow Up On"]),
    status: sel(r.props["Status"]),
    framing: sel(r.props["Framing Used"]),
    nextContact: text(r.props["Next Contact"]),
    notes: text(r.props["Notes"]),
    website: url(r.props["Website"]),
  }));
});

/** Rows whose follow-up date has arrived and that are still waiting on a reply */
export function followUpsDue(rows: Outreach[], today = todayISO()) {
  return rows.filter(
    (r) => r.followUpOn && r.followUpOn.slice(0, 10) <= today && (r.status === "Sent" || r.status === "No response"),
  );
}

export async function appendOutreachNote(id: string, existing: string, line: string) {
  const stamp = todayISO();
  const next = (existing ? existing + "\n" : "") + `${stamp}: ${line}`;
  await update(id, { Notes: W.text(next.slice(-1900)) });
}

export async function setOutreachStatus(id: string, status: string) {
  await update(id, { Status: W.select(status) });
}
export async function setOutreachFollowUp(id: string, d: string | null) {
  await update(id, { "Follow Up On": W.date(d) });
}

export async function recordOutreachSend(o: {
  id?: string; center: string; contact?: string; sentTo: string; dateSent: string; followUpOn: string;
  framing?: string | null; nextContact?: string; note?: string; existingNotes?: string;
}) {
  const properties: Props = {
    "Sent To": W.email(o.sentTo),
    "Date Sent": W.date(o.dateSent),
    "Follow Up On": W.date(o.followUpOn),
    Status: W.select("Sent"),
  };
  if (o.framing) properties["Framing Used"] = W.select(o.framing);
  if (o.nextContact) properties["Next Contact"] = W.text(o.nextContact);
  if (o.note) {
    const next = (o.existingNotes ? o.existingNotes + "\n" : "") + `${o.dateSent}: ${o.note}`;
    properties.Notes = W.text(next.slice(-1900));
  }
  if (o.id) {
    await update(o.id, properties);
    return o.id;
  }
  properties.Center = W.title(o.center);
  if (o.contact) properties.Contact = W.text(o.contact);
  properties["Contact Type"] = W.select(/^(info|hello|contact|admin|office|scheduling|front)/i.test(o.sentTo) ? "Generic inbox" : "Named person");
  const page: any = await notion().pages.create({ parent: { data_source_id: DS.outreach }, properties } as any);
  return page.id as string;
}

/* ---------------- Call queue (Target Pipeline) ---------------- */

export type Target = {
  id: string; url: string; center: string; city: string; state: string | null; phone: string | null;
  rank: number | null; status: string | null; callback: string | null; needsCallback: boolean;
  nextStep: string; notes: string; scoreBasis: string; firstDialed: string | null; lastContact: string | null;
};

function toTarget(r: Row): Target {
  return {
    id: r.id, url: r.url,
    center: text(r.props["Center"]),
    city: text(r.props["City"]),
    state: sel(r.props["State"]),
    phone: phone(r.props["Phone"]),
    rank: num(r.props["Rank"]),
    status: sel(r.props["Status"]),
    callback: date(r.props["Callback"]),
    needsCallback: check(r.props["Needs Callback"]),
    nextStep: text(r.props["Next Step"]),
    notes: text(r.props["Owner Notes"]),
    scoreBasis: text(r.props["Score Basis"]),
    firstDialed: date(r.props["First Dialed"]),
    lastContact: date(r.props["Last Contact"]),
  };
}

/** Mirrors the "Call Queue" view in Notion */
export async function getCallQueue(limit = 10): Promise<Target[]> {
  const rows = await queryAll(
    DS.pipeline,
    {
      filter: {
        and: [
          { property: "Sellable Now", checkbox: { equals: true } },
          { property: "Status", select: { equals: "Not Contacted" } },
          { property: "Hospital Suspected", checkbox: { equals: false } },
          { property: "MRI Evidence", select: { does_not_equal: "ruled_out" } },
          { property: "Duplicate Site", checkbox: { equals: false } },
          { property: "Mark Duplicate", checkbox: { equals: false } },
          { property: "Needs Callback", checkbox: { equals: false } },
        ],
      },
      sorts: [{ property: "Rank", direction: "ascending" }],
    },
    limit,
  );
  return rows.slice(0, limit).map(toTarget);
}

/** Mirrors the "Callbacks" view */
export async function getCallbacks(): Promise<Target[]> {
  const rows = await queryAll(DS.pipeline, {
    filter: {
      and: [
        { property: "Needs Callback", checkbox: { equals: true } },
        { property: "Status", select: { does_not_equal: "Dead" } },
      ],
    },
    sorts: [{ property: "Callback", direction: "ascending" }],
  });
  return rows.map(toTarget);
}

export async function getPipelineCounts(): Promise<Record<string, number>> {
  const rows = await queryAll(DS.pipeline, {}, 2000);
  const c: Record<string, number> = {};
  for (const r of rows) {
    const s = sel(r.props["Status"]) ?? "Not Contacted";
    c[s] = (c[s] ?? 0) + 1;
  }
  return c;
}

export async function logCall(id: string, existing: Target, c: {
  outcome: "reached" | "voicemail" | "meeting" | "dead";
  answeredBy?: string; notes?: string; nextStep?: string; callback?: string | null;
}) {
  const today = todayISO();
  const properties: Props = {};
  if (!existing.firstDialed) properties["First Dialed"] = W.date(today);
  if (c.outcome === "voicemail") {
    properties["Needs Callback"] = W.check(true);
    properties.Status = W.select("Called");
  } else {
    properties["Last Contact"] = W.date(today);
    properties["Needs Callback"] = W.check(!!c.callback);
    properties.Status = W.select(c.outcome === "meeting" ? "Meeting" : c.outcome === "dead" ? "Dead" : "Called");
  }
  if (c.callback !== undefined) properties.Callback = W.date(c.callback || null);
  if (c.answeredBy) properties["Answered By"] = W.text(c.answeredBy);
  if (c.nextStep) properties["Next Step"] = W.text(c.nextStep);
  if (c.notes) {
    const next = (existing.notes ? existing.notes + "\n" : "") + `${today}: ${c.notes}`;
    properties["Owner Notes"] = W.text(next.slice(-1900));
  }
  await update(id, properties);
}

export async function getTarget(id: string): Promise<Target> {
  const p: any = await notion().pages.retrieve({ page_id: id });
  return toTarget({ id: p.id, url: p.url, props: p.properties });
}

/* ---------------- Content Tracker ---------------- */

export type Post = {
  id: string; url: string; title: string; status: string | null; postDate: string | null; week: number | null;
  pillar: string | null; format: string | null; platforms: string[]; hook: string;
  views: number | null; saves: number | null; shares: number | null; clicks: number | null; signups: number | null;
};

export async function getContent(): Promise<Post[]> {
  const rows = await queryAll(DS.content, { sorts: [{ property: "Week", direction: "ascending" }] });
  return rows.map((r) => ({
    id: r.id, url: r.url,
    title: text(r.props["Post"]),
    status: sel(r.props["Status"]),
    postDate: date(r.props["Post date"]),
    week: num(r.props["Week"]),
    pillar: sel(r.props["Pillar"]),
    format: sel(r.props["Format"]),
    platforms: multi(r.props["Platform"]),
    hook: text(r.props["Hook"]),
    views: num(r.props["Views"]),
    saves: num(r.props["Saves"]),
    shares: num(r.props["Shares"]),
    clicks: num(r.props["Link clicks"]),
    signups: num(r.props["Signups"]),
  }));
}

export async function setPostStatus(id: string, status: string) {
  await update(id, { Status: W.select(status) });
}
export async function setPostDate(id: string, d: string | null) {
  await update(id, { "Post date": W.date(d) });
}

/* ---------------- Research notes ---------------- */

/** Saves pasted research as a page under the Execution Roadmap page so it isn't lost */
export async function saveResearchNote(title: string, body: string, parentPageId = process.env.NOTION_RESEARCH_PARENT ?? "3f23149eb9328111aa5ad3c0e32839b4") {
  const page: any = await notion().pages.create({
    parent: { page_id: parentPageId },
    properties: { title: W.title(title) },
    markdown: body.slice(0, 90000),
  } as any);
  return page.url as string;
}

export async function ping(): Promise<boolean> {
  try {
    await (notion() as any).dataSources.query({ data_source_id: DS.tasks, page_size: 1 });
    return true;
  } catch {
    return false;
  }
}
