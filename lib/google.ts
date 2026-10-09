import "server-only";
import { google } from "googleapis";
import { Readable } from "node:stream";
import { env } from "./config";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify", // read replies, create drafts, send
  "https://www.googleapis.com/auth/calendar.events", // follow-up + due-date events your assistants can see
  "https://www.googleapis.com/auth/drive.file", // the one context doc this app creates
  "https://www.googleapis.com/auth/spreadsheets.readonly", // waitlist sheet
];

export function oauthClient(redirectUri?: string) {
  if (!env.googleClientId || !env.googleClientSecret) throw new Error("Google OAuth client is not configured");
  const c = new google.auth.OAuth2(env.googleClientId, env.googleClientSecret, redirectUri);
  if (env.googleRefreshToken) c.setCredentials({ refresh_token: env.googleRefreshToken });
  return c;
}

const gmail = () => google.gmail({ version: "v1", auth: oauthClient() });
const calendar = () => google.calendar({ version: "v3", auth: oauthClient() });
const drive = () => google.drive({ version: "v3", auth: oauthClient() });
const sheets = () => google.sheets({ version: "v4", auth: oauthClient() });

/* ---------------- Gmail ---------------- */

let _me: string | null = null;
export async function myEmail(): Promise<string> {
  if (_me) return _me;
  const p = await gmail().users.getProfile({ userId: "me" });
  _me = p.data.emailAddress ?? "";
  return _me;
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

export async function sendEmail(m: OutMail) {
  const res = await gmail().users.messages.send({
    userId: "me",
    requestBody: { raw: buildRaw({ ...m, from: `${env.senderName} <${await myEmail()}>` }), threadId: m.threadId },
  });
  return res.data;
}

export async function createDraft(m: OutMail) {
  const res = await gmail().users.drafts.create({
    userId: "me",
    requestBody: { message: { raw: buildRaw({ ...m, from: `${env.senderName} <${await myEmail()}>` }), threadId: m.threadId } },
  });
  return res.data;
}

export async function updateDraft(id: string, m: OutMail) {
  await gmail().users.drafts.update({
    userId: "me",
    id,
    requestBody: { message: { raw: buildRaw({ ...m, from: `${env.senderName} <${await myEmail()}>` }), threadId: m.threadId } },
  });
}

export async function sendDraft(id: string) {
  return (await gmail().users.drafts.send({ userId: "me", requestBody: { id } })).data;
}

export async function deleteDraft(id: string) {
  await gmail().users.drafts.delete({ userId: "me", id });
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

export type Draft = { id: string; to: string; subject: string; body: string; threadId?: string; inReplyTo?: string };

/** Drafts addressed to any of the given emails (the outreach list), so agent drafts show up for approval */
export async function listDraftsTo(emails: string[]): Promise<Draft[]> {
  const wanted = new Set(emails.map((e) => e.toLowerCase()));
  const list = await gmail().users.drafts.list({ userId: "me", maxResults: 50 });
  const out: Draft[] = [];
  for (const d of list.data.drafts ?? []) {
    const full = await gmail().users.drafts.get({ userId: "me", id: d.id!, format: "full" });
    const msg = full.data.message;
    const to = header(msg, "To");
    const addr = (to.match(/<([^>]+)>/)?.[1] ?? to).trim().toLowerCase();
    if (!wanted.has(addr)) continue;
    out.push({
      id: d.id!,
      to: addr,
      subject: header(msg, "Subject"),
      body: plainBody(msg?.payload),
      threadId: msg?.threadId ?? undefined,
      inReplyTo: header(msg, "In-Reply-To") || undefined,
    });
  }
  return out;
}

/** Has this address written to us since the given date? Returns the newest reply if so. */
export async function findReply(addr: string, sinceISO: string) {
  const after = sinceISO.slice(0, 10).replace(/-/g, "/");
  const res = await gmail().users.messages.list({ userId: "me", q: `from:${addr} after:${after}`, maxResults: 1 });
  const m = res.data.messages?.[0];
  if (!m) return null;
  const full = await gmail().users.messages.get({ userId: "me", id: m.id!, format: "metadata", metadataHeaders: ["Subject", "Date"] });
  return { id: m.id!, threadId: m.threadId!, subject: header(full.data, "Subject"), snippet: full.data.snippet ?? "", date: header(full.data, "Date") };
}

/** The last message we sent to this address, so a follow-up can stay in the same thread */
export async function lastSentTo(addr: string) {
  const res = await gmail().users.messages.list({ userId: "me", q: `in:sent to:${addr}`, maxResults: 1 });
  const m = res.data.messages?.[0];
  if (!m) return null;
  const full = await gmail().users.messages.get({ userId: "me", id: m.id!, format: "full" });
  return {
    threadId: m.threadId!,
    messageId: header(full.data, "Message-ID") || header(full.data, "Message-Id"),
    subject: header(full.data, "Subject"),
    body: plainBody(full.data.payload).slice(0, 4000),
  };
}

/* ---------------- Calendar ---------------- */

/** Creates or updates an all-day event keyed by `key`, so reruns never duplicate. */
export async function upsertAllDayEvent(key: string, dateISO: string, summary: string, description = "") {
  const cal = calendar();
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
  const cal = calendar();
  const existing = await cal.events.list({ calendarId: "primary", privateExtendedProperty: [`ripehq=${key}`], maxResults: 1 });
  const ev = existing.data.items?.[0];
  if (ev?.id) await cal.events.delete({ calendarId: "primary", eventId: ev.id });
}

/* ---------------- Drive: the assistant context doc ---------------- */

/** Writes plain text into a Google Doc. Returns the doc id (creates the doc the first time). */
export async function writeContextDoc(content: string, docId?: string): Promise<string> {
  const d = drive();
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

export async function getWaitlistStats(sheetId: string): Promise<WaitlistStats> {
  const res = await sheets().spreadsheets.values.get({ spreadsheetId: sheetId, range: "A:I" });
  const rows = (res.data.values ?? []).slice(1); // header row
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

export async function ping(): Promise<string | null> {
  try {
    return await myEmail();
  } catch {
    return null;
  }
}
