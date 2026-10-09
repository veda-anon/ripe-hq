import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config";

function client() {
  if (!env.anthropicKey) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: env.anthropicKey });
}

/** Veda doesn't want em dashes or AI-sounding phrasing in anything sent as her. */
export function humanize(s: string): string {
  return s
    .replace(/\s*—\s*/g, ", ")
    .replace(/\s*–\s*/g, " to ")
    .replace(/,\s*,/g, ",")
    .trim();
}

const RIPE_CONTEXT = `Ripe (ripe.care) is an early-stage startup helping people get cash-pay MRIs without the runaround: transparent prices at independent imaging centers, booked fast, no insurance approval wait. The founder is validating in NYC/NJ. Supply side = independent imaging centers (clinics). Demand side = consumers reached through TikTok/Instagram content and a waitlist. Current plan: Phase 0 desk research and secret shop (Oct 7 to 20), Phase 1 customer and supply discovery (Oct 21 to Nov 17), Phase 2 concierge pilot (Nov 18 to Dec 29), Phase 3 productize only if the Dec 29 gate passes. Ripe does not provide medical care.`;

export type ProposedTask = {
  title: string;
  workstream: "Research" | "Legal" | "Operations" | "Growth" | "Content" | "Decision";
  phase: "Phase 0" | "Phase 1" | "Phase 2" | "Phase 3" | "Content";
  due: string | null;
  details: string;
  why: string;
};

export async function extractActionItems(research: string, today: string, existingTitles: string[]): Promise<{ summary: string; tasks: ProposedTask[] }> {
  const res = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: 4000,
    system: `${RIPE_CONTEXT}

You turn research notes into a short list of concrete next actions for a solo founder who is overwhelmed. Rules:
- Only propose actions the research actually supports. 0 to 7 items. Fewer is better.
- Each title starts with a verb and is something she can finish in one sitting (under ~2 hours). Split bigger things.
- Skip anything that duplicates an existing task (list provided).
- Pick a realistic due date (YYYY-MM-DD) relative to today and the phase dates, or null if it is not time-bound.
- "details" says exactly what done looks like, in one or two sentences. "why" cites what in the research motivates it.
- Plain, human language. No em dashes.`,
    tools: [
      {
        name: "propose_actions",
        description: "Return a one-paragraph summary of the research and the proposed next actions.",
        input_schema: {
          type: "object",
          properties: {
            summary: { type: "string", description: "2 to 4 sentence plain-English summary of what the research found" },
            tasks: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  workstream: { type: "string", enum: ["Research", "Legal", "Operations", "Growth", "Content", "Decision"] },
                  phase: { type: "string", enum: ["Phase 0", "Phase 1", "Phase 2", "Phase 3", "Content"] },
                  due: { type: ["string", "null"] },
                  details: { type: "string" },
                  why: { type: "string" },
                },
                required: ["title", "workstream", "phase", "due", "details", "why"],
              },
            },
          },
          required: ["summary", "tasks"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "propose_actions" },
    messages: [
      {
        role: "user",
        content: `Today is ${today}.\n\nExisting open tasks:\n${existingTitles.map((t) => `- ${t}`).join("\n")}\n\nResearch notes:\n"""\n${research.slice(0, 60000)}\n"""`,
      },
    ],
  });
  const block = res.content.find((b) => b.type === "tool_use") as any;
  const input = block?.input ?? { summary: "", tasks: [] };
  return {
    summary: humanize(input.summary ?? ""),
    tasks: (input.tasks ?? []).map((t: ProposedTask) => ({ ...t, title: humanize(t.title), details: humanize(t.details), why: humanize(t.why) })),
  };
}

export async function draftFollowUp(o: {
  center: string; contact: string; previousSubject: string; previousBody: string; daysSince: number;
  framing: string | null; notes: string; followUpNumber: number;
}): Promise<string> {
  const res = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: 600,
    system: `${RIPE_CONTEXT}

You write short follow-up emails from ${env.senderName}, Ripe's founder, to independent imaging centers that haven't replied. Rules:
- 50 to 90 words. Plain text. No subject line, no signature block beyond "${env.senderName}".
- Sound like a real person writing quickly: warm, specific, zero hype. No em dashes. No "I hope this email finds you well", no "just circling back", no "touching base".
- One clear, low-effort ask (a 15 minute call this week, or who the right person is).
- Use the current framing: Ripe sends cash-pay patients to independent centers. Don't promise volumes, prices, or anything medical.
- If this is follow-up #2 or later, make it the polite last note and give them an easy out.`,
    messages: [
      {
        role: "user",
        content: `Center: ${o.center}\nContact: ${o.contact || "unknown (generic inbox)"}\nFollow-up number: ${o.followUpNumber}\nDays since last email: ${o.daysSince}\nFraming used: ${o.framing ?? "unknown"}\nNotes: ${o.notes || "none"}\n\nPrevious email (subject "${o.previousSubject}"):\n"""\n${o.previousBody || "(not found)"}\n"""\n\nWrite the follow-up body.`,
      },
    ],
  });
  const t = res.content.find((b) => b.type === "text") as any;
  return humanize(t?.text ?? "");
}

export async function draftFirstEmail(o: { center: string; contact: string; notes: string; ask: string }): Promise<{ subject: string; body: string }> {
  const res = await client().messages.create({
    model: env.anthropicModel,
    max_tokens: 700,
    system: `${RIPE_CONTEXT}

You write first-touch emails from ${env.senderName}, Ripe's founder, to independent imaging centers. 70 to 120 words, plain text, human, specific to the center, no em dashes, no hype, one clear ask. Framing: Ripe sends cash-pay patients to independent centers; we're talking to a small number of NYC/NJ centers before launch. Return the subject on the first line as "Subject: ..." then a blank line, then the body ending with "${env.senderName}".`,
    messages: [{ role: "user", content: `Center: ${o.center}\nContact: ${o.contact || "front desk / generic inbox"}\nWhat I know: ${o.notes || "nothing yet"}\nAsk: ${o.ask || "15 minute call about how they handle self-pay MRI patients"}` }],
  });
  const t = humanize((res.content.find((b) => b.type === "text") as any)?.text ?? "");
  const m = t.match(/^Subject:\s*(.+)\n+([\s\S]*)$/i);
  return m ? { subject: m[1].trim(), body: m[2].trim() } : { subject: `Cash-pay MRI patients for ${o.center}`, body: t };
}
