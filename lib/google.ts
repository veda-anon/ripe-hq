import "server-only";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { env, connectedAccounts, type Account } from "./config";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // read replies, create drafts, send
  "https://www.googleapis.com/auth/calendar.events", // follow-up + due-date events your assistants can see
  "https://www.googleapis.com/auth/drive.file", // the one context doc this app creates
  "https://www.googleapis.com/auth/spreadsheets.readonly", // waitlist sheet
];

/** OAuth client. Pass an account to act as it; omit for the sign-in flow. */
export function oauthClient(redirectUri?: string, account?: Account) {
  if (!env.googleClientId || !env.googleClientSecret) throw new Error("Google OAuth client is not configured");
  const c = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, redirectUri);
  if (account) {
    const token = env.googleTokens[account];
    if (!token) throw new Error(`The ${account} Google account isn't connected`);
    c.setCredentials({ refresh_token: token });
  }
  return c;
}

const gmail = (a: Account) => google.gmail({ version: "v1", auth: oauthClient(undefined, a) });
const calendar = (a: Account) => google.calendar({ version: "v3", auth: oauthClient(undefined, a) });
const drive = (a: Account) => google.drive({ version: "v3", auth: oauthClient(undefined, a) });
const sheets = (a: Account) => google.sheets({ version: "v4", auth: oauthClient(undefined, a) });

/** The account for calendar, brief and assistant doc. Falls back to whichever account is connected. */
export function assistantAccount(): Account {
  const c = connectedAccounts();
  return c.includes(env.assistantAccount) ? env.assistantAccount : c[0];
}

/** Default "Send from" for new emails */
export function defaultSendFrom(): Account {
  const c = connectedAccounts();
  return c.includes(env.sendFrom) ? env.sendFrom : c[0];
}

/* ---------------- Gmail ---------------- */

const _me: Partial<Record<Account, string>> = {};
export async function myEmail(a: Account): Promise<string> {
  if (_me[a]) return _me[a]!;
  const p = await gmail(a).users.getProfile({ userId: "me" });
  _me[a] = p.data.emailAddress ?? "";
  return _me[a]!;
}

/** Connected accounts with their addresses, for the "Send from" picker and Settings */
export async function accountEmails(): Promise<{ account: Account; email: string | null }[]> {
  return Promise.all(
    connectedAccounts().map(async (account) => ({ account, email: await myEmail(account).catch(() => null) })),
  );
}

function encodeHeader(s: string) {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
}

function buildRaw(m: { to: string; subject: string; body: string; from?: string; inReplyTo?: string; cc?: string }) {
  const headers = [
    m.from ? `From: ${m.from}` : null,
    `To: ${m.to}`,
    m.cc ? `Cc: ${m.cc}` : null,
    `Subject: ${encodeHeader(m.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    m.inReplyTo ? `In-Reply-To: ${m.inReplyTo}` : null,
    m.inReplyTo ? `References: ${m.inReplyTo}` : null,
  ].filter(Boolean);
  const raw = headers.join("\r\n") + "\r\n\r\n" + m.body.replace(/\r?\n/g, "\r\n");
  return Buffer.from(raw, "utf8").toString("base64url");
}

export type OutMail = { to: string; subject: string; body: string; threadId?: string; inReplyTo?: string; cc?: string };

async function raw(a: Account, m: OutMail) {
  return buildRaw({ ...m, from: `${env.senderName} <${await myEmail(a)}>` });
}

export async function sendEmail(a: Account, m: OutMail) {
  return (await gmail(a).users.messages.send({ userId: "me", requestBody: { raw: await raw(a, m), threadId: m.threadId } })).data;
}

export async function createDraft(a: Account, m: OutMail) {
  return (await gmail(a).users.drafts.create({ userId: "me", requestBody: { message: { raw: await raw(a, m), threadId: m.threadId } } })).data;
}

export async function updateDraft(a: Account, id: string, m: OutMail) {
  await gmail(a).users.drafts.update({ userId: "me", id, requestBody: { message: { raw: await raw(a, m), threadId: m.threadId } } });
}

export async function sendDraft(a: Account, id: string) {
  return (await gmail(a).users.drafts.send({ userId: "me", requestBody: { id } })).data;
}

export async function deleteDraft(a: Account, id: string) {
  await gmail(a).users.drafts.delete({ userId: "me", id });
}

function header(msg: any, name: string): string {
  return msg?.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function plainBody(payload: any): string {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return Buffer.from(payload.body.data, "base64url").toString("utf8");
  for (const p of payload.parts ?? []) {
    const t = plainBody(p);
    if (t) return t;
  }
  return "";
}

export type Draft = { id: string; account: Account; to: string; subject: string; body: string; threadId?: string; inReplyTo?: string };

/** Drafts (in every connected account) addressed to anyone on the outreach list, so they show up for approval */
export async function listDraftsTo(emails: string[]): Promise<Draft[]> {
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const out: Draft[] = [];
  for (const a of connectedAccounts()) {
    const list = await gmail(a).users.drafts.list({ userId: "me", maxResults: 50 });
    for (const d of list.data.drafts ?? []) {
      const full = await gmail(a).users.drafts.get({ userId: "me", id: d.id!, format: "full" });
      const msg = full.data.message;
      const to = header(msg, "To");
      const addr = (to.match(/<([^>]+)>/)?.[1] ?? to).trim().toLowerCase();
      if (!wanted.has(addr)) continue;
      out.push({
        id: d.id!,
        account: a,
        to: addr,
        subject: header(msg, "Subject"),
        body: plainBody(msg?.payload),
        threadId: msg?.threadId ?? undefined,
        inReplyTo: header(msg, "In-Reply-To") || undefined,
      });
    }
  }
  return out;
}

/** Has this address written to either inbox since the given date? Returns the newest reply if so. */
export async function findReply(addr: string, sinceISO: string) {
  const after = sinceISO.slice(0, 10).replace(/-/g, "/");
  for (const a of connectedAccounts()) {
    const res = await gmail(a).users.messages.list({ userId: "me", q: `from:${addr} after:${after}`, maxResults: 1 });
    const m = res.data.messages?.[0];
    if (!m) continue;
    const full = await gmail(a).users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["Subject", "Date"] });
    return { account: a, id: m.id!, threadId: m.threadId!, subject: header(full.data, "Subject"), snippet: full.data.snippet ?? "", date: header(full.data, "Date") };
  }
  return null;
}

/** The most recent message we sent to this address from either account, so a follow-up stays in that thread and mailbox */
export async function lastSentTo(addr: string) {
  let best: { account: Account; internalDate: number; threadId: string; messageId: string; subject: string; body: string } | null = null;
  for (const a of connectedAccounts()) {
    const res = await gmail(a).users.messages.list({ userId: "me", q: `in:sent to:${addr}`, maxResults: 1 });
    const m = res.data.messages?.[0];
    if (!m) continue;
    const full = await gmail(a).users.messages.get({ userId: "me", id: m.id!, format: "full" });
    const when = Number(full.data.internalDate ?? 0);
    if (!best || when > best.internalDate) {
      best = {
        account: a,
        internalDate: when,
        threadId: m.threadId!,
        messageId: header(full.data, "Message-ID") || header(full.data, "Message-Id"),
        subject: header(full.data, "Subject"),
        body: plainBody(full.data.payload).slice(0, 4000),
      };
    }
  }
  return best;
}

/* ---------------- Calendar (assistant account) ---------------- */

/** Creates or updates an all-day event keyed by `key`, so reruns never duplicate. */
export async function upsertAllDayEvent(key: string, dateISO: string, summary: string, description = "") {
  const cal = calendar(assistantAccount());
  const existing = await cal.events.list({ calendarId: "primary", privateExtendedProperty: [`ripehq=${key}`], maxResults: 1 });
  const end = new Date(dateISO + "T12:00:00Z");
  end.setUTCDate(end.getUTCDate() + 1);
  const body = {
    summary,
    description,
    start: { date: dateISO },
    end: { date: end.toISOString().slice(0, 10) },
    transparency: "transparent",
    extendedProperties: { private: { ripehq: key } },
  };
  const ev = existing.data.items?.[0];
  if (ev?.id) {
    if (ev.start?.date === dateISO && ev.summary === summary) return;
    await cal.events.patch({ calendarId: "primary", eventId: ev.id, requestBody: body });
  } else {
    await cal.events.insert({ calendarId: "primary", requestBody: body });
  }
}

export async function removeEvent(key: string) {
  const cal = calendar(assistantAccount());
  const existing = await cal.events.list({ calendarId: "primary", privateExtendedProperty: [`ripehq=${key}`], maxResults: 1 });
  const ev = existing.data.items?.[0];
  if (ev?.id) await cal.events.delete({ calendarId: "primary", eventId: ev.id });
}

/* ---------------- Drive: the assistant context doc ---------------- */

/** Writes plain text into a Google Doc in the assistant account. Returns the doc id (creates it the first time). */
export async function writeContextDoc(content: string, docId?: string): Promise<string> {
  const d = drive(assistantAccount());
  const media = { mimeType: "text/plain", body: Readable.from([content]) };
  const name = "Ripe HQ: Context for my assistants";
  if (!docId) {
    // drive.file scope only sees files this app created, so this finds our doc and nothing else
    const found = await d.files.list({ q: `name = '${name}' and trashed = false`, fields: "files(id)", pageSize: 1 });
    docId = found.data.files?.[0]?.id ?? undefined;
  }
  if (docId) {
    await d.files.update({ fileId: docId, media });
    return docId;
  }
  const res = await d.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.document" },
    media,
    fields: "id",
  });
  return res.data.id!;
}

/* ---------------- Sheets: waitlist ---------------- */

export type WaitlistStats = { total: number; last7: number; bySource: Record<string, number>; topZips: [string, number][] };

/** Reads the waitlist with whichever connected account can open the sheet */
export async function getWaitlistStats(sheetId: string): Promise<WaitlistStats> {
  let lastErr: unknown;
  for (const a of connectedAccounts()) {
    try {
      const res = await sheets(a).spreadsheets.values.get({ spreadsheetId: sheetId, range: "A:I" });
      return summarizeWaitlist(res.data.values ?? []);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("No Google account could open the waitlist sheet");
}

function summarizeWaitlist(values: any[][]): WaitlistStats {
  const rows = values.slice(1); // header row
  const weekAgo = Date.now() - 7 * 86400000;
  const bySource: Record<string, number> = {};
  const zips: Record<string, number> = {};
  let last7 = 0;
  for (const r of rows) {
    const [ts, , zip, source, , , utmSource] = r;
    const src = (utmSource || source || "direct").toString().toLowerCase();
    bySource[src] = (bySource[src] ?? 0) + 1;
    const z = String(zip ?? "").replace(/^'/, "");
    if (z) zips[z] = (zips[z] ?? 0) + 1;
    const t = Date.parse(ts);
    if (!isNaN(t) && t >= weekAgo) last7++;
  }
  const topZips = Object.entries(zips).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { total: rows.length, last7, bySource, topZips };
}
