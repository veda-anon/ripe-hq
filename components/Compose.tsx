"use client";
import { useActionState, useState, useTransition } from "react";
import type { ComposeState } from "@/app/actions";

type Prefill = { outreachId?: string; center?: string; contact?: string; to?: string; notes?: string };

export function Compose({
  send,
  aiDraft,
  prefill,
  unsent,
  claudeOn,
  senders,
  defaultFrom,
}: {
  send: (s: ComposeState, fd: FormData) => Promise<ComposeState>;
  aiDraft: (center: string, contact: string, notes: string, ask: string) => Promise<{ subject: string; body: string } | { error: string }>;
  prefill: Prefill;
  unsent: { id: string; center: string; contact: string; to: string | null; notes: string }[];
  claudeOn: boolean;
  senders: { value: string; label: string }[];
  defaultFrom: string;
}) {
  const [state, action, sending] = useActionState(send, {});
  const [p, setP] = useState<Prefill>(prefill);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [ask, setAsk] = useState("");
  const [drafting, start] = useTransition();
  const [draftErr, setDraftErr] = useState("");

  return (
    <form action={action} className="form-grid">
      {unsent.length > 0 && (
        <div className="field full">
          <label htmlFor="pick">Pick a clinic from Notion (not emailed yet)</label>
          <select
            id="pick"
            className="select"
            value={p.outreachId ?? ""}
            onChange={(e) => {
              const r = unsent.find((u) => u.id === e.target.value);
              setP(r ? { outreachId: r.id, center: r.center, contact: r.contact, to: r.to ?? "", notes: r.notes } : {});
            }}
          >
            <option value="">New clinic (adds a row to Notion)</option>
            {unsent.map((u) => <option key={u.id} value={u.id}>{u.center}</option>)}
          </select>
        </div>
      )}
      <input type="hidden" name="outreachId" value={p.outreachId ?? ""} />
      <input type="hidden" name="existingNotes" value={p.notes ?? ""} />
      <div className="field"><label htmlFor="center">Center</label><input id="center" name="center" className="input" value={p.center ?? ""} onChange={(e) => setP({ ...p, center: e.target.value })} required /></div>
      <div className="field"><label htmlFor="contact">Contact name</label><input id="contact" name="contact" className="input" value={p.contact ?? ""} onChange={(e) => setP({ ...p, contact: e.target.value })} placeholder="Optional" /></div>
      {senders.length > 1 ? (
        <div className="field full">
          <label htmlFor="from">Send from</label>
          <select id="from" name="from" className="select" defaultValue={defaultFrom}>
            {senders.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      ) : (
        <input type="hidden" name="from" value={senders[0]?.value ?? ""} />
      )}
      <div className="field full"><label htmlFor="to">To</label><input id="to" name="to" type="email" className="input" value={p.to ?? ""} onChange={(e) => setP({ ...p, to: e.target.value })} required /></div>

      {claudeOn && (
        <div className="field full">
          <label htmlFor="ask">Want a first draft? What's the ask?</label>
          <div style={{ display: "flex", gap: 10 }}>
            <input id="ask" className="input" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="e.g. 15 min call about how they handle self-pay MRI patients" />
            <button
              type="button"
              className="btn btn-ghost"
              disabled={drafting || !p.center}
              onClick={() =>
                start(async () => {
                  setDraftErr("");
                  const r = await aiDraft(p.center ?? "", p.contact ?? "", p.notes ?? "", ask);
                  if ("error" in r) setDraftErr(r.error);
                  else { setSubject(r.subject); setBody(r.body); }
                })
              }
            >
              {drafting ? "Drafting…" : "Draft it"}
            </button>
          </div>
          {draftErr && <div className="msg err">{draftErr}</div>}
        </div>
      )}

      <div className="field full"><label htmlFor="subject">Subject</label><input id="subject" name="subject" className="input" value={subject} onChange={(e) => setSubject(e.target.value)} required /></div>
      <div className="field full"><label htmlFor="body">Message</label><textarea id="body" name="body" className="textarea" style={{ minHeight: 220 }} value={body} onChange={(e) => setBody(e.target.value)} required /></div>

      <div className="actions full">
        <button className="btn btn-plum" name="mode" value="send" disabled={sending}>{sending ? "Sending…" : "Send from Gmail"}</button>
        <button className="btn btn-ghost" name="mode" value="draft" disabled={sending}>Save as Gmail draft</button>
        <span className="note">Sending logs it in Notion and sets the follow-up date automatically.</span>
      </div>
      {state.ok && <div className="msg ok full">{state.ok}</div>}
      {state.error && <div className="msg err full">{state.error}</div>}
    </form>
  );
}
