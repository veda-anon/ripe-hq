import { TZ } from "./config";

/** Today's date in New York as YYYY-MM-DD */
export function todayISO(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Add business days (skips Sat/Sun) */
export function addBusinessDays(iso: string, n: number): string {
  let d = iso;
  let added = 0;
  while (added < n) {
    d = addDays(d, 1);
    const day = new Date(d + "T12:00:00Z").getUTCDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}

export function fmtShort(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.slice(0, 10) + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function fmtLong(iso: string): string {
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "2 days late", "today", "in 3 days" */
export function relative(iso: string | null | undefined, today = todayISO()): string {
  if (!iso) return "";
  const n = daysBetween(today, iso.slice(0, 10));
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n < 0) return `${-n} days late`;
  return `in ${n} days`;
}

/** Monday-start week bounds for a date */
export function weekBounds(iso = todayISO()): { start: string; end: string } {
  const day = new Date(iso + "T12:00:00Z").getUTCDay(); // 0 Sun
  const offset = day === 0 ? -6 : 1 - day;
  const start = addDays(iso, offset);
  return { start, end: addDays(start, 6) };
}
