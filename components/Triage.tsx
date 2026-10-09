"use client";
import { useState, useTransition } from "react";
import type { ProposedTask } from "@/lib/claude";
import type { TriageResult } from "@/app/actions";

export function Triage({
  triage,
  accept,
  enabled,
}: {
  triage: (text: string) => Promise<TriageResult>;
  accept: (i: { tasks: ProposedTask[]; title: string; research: string; summary: string; saveNote: boolean }) => Promise<{ created: number; noteUrl: string | null }>;
  enabled: boolean;
}) {
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [saveNote, setSaveNote] = useState(true);
  const [res, setRes] = useState<TriageResult | null>(null);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  const [edits, setEdits] = useState<Record<number, ProposedTask>>({});
  const [done, setDone] = useState<{ created: number; noteUrl: string | null } | null>(null);
  const [pending, start] = useTransition();

  const tasks = (res?.tasks ?? []).map((t, i) => edits[i] ?? t);
  const chosen = tasks.filter((_, i) => picked[i]);

  if (done) {
    return (
      <div className="msg ok">
        Added {done.created} {done.created === 1 ? "task" : "tasks"} to Execution Tasks.{" "}
        {done.noteUrl && <a href={done.noteUrl} target="_blank" rel="noreferrer">Research saved in Notion.</a>}{" "}
        <button className="btn-link" onClick={() => { setDone(null); setRes(null); setText(""); setTitle(""); setPicked({}); setEdits({}); }}>Triage more</button>
      </div>
    );
  }

  return (
    <div>
      {!res?.tasks && (
        <>
          <div className="field">
            <label htmlFor="r-title">What's this about?</label>
            <input id="r-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. OpenLoop pricing and contract terms" />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="r-text">Paste the research</label>
            <textarea id="r-text" className="textarea" style={{ minHeight: 280 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste a Claude answer, call notes, a competitor teardown…" />
          </div>
          <div className="actions">
            <button className="btn btn-plum" disabled={!enabled || pending || text.trim().length < 40} onClick={() => start(async () => { const r = await triage(text); setRes(r); setPicked(Object.fromEntries((r.tasks ?? []).map((_, i) => [i, true]))); })}>
              {pending ? "Reading it…" : "Find the next steps"}
            </button>
            {!enabled && <span className="note">Needs ANTHROPIC_API_KEY. See Connections.</span>}
          </div>
          {res?.error && <div className="msg err">{res.error}</div>}
        </>
      )}

      {res?.tasks && (
        <>
          {res.summary && (
            <div className="banner" style={{ marginTop: 0 }}><b>What it says:</b> {res.summary}</div>
          )}
          <div className="list" style={{ marginTop: 16 }}>
            {tasks.length === 0 && <p className="empty">Nothing actionable that isn't already on your list. That's a fine outcome.</p>}
            {tasks.map((t, i) => (
              <div className="proposal" key={i}>
                <button type="button" className={`check ${picked[i] ? "on" : ""}`} aria-pressed={!!picked[i]} aria-label={`Include ${t.title}`} onClick={() => setPicked({ ...picked, [i]: !picked[i] })} />
                <div style={{ opacity: picked[i] ? 1 : 0.55 }}>
                  <input className="input" value={t.title} aria-label="Task title" onChange={(e) => setEdits({ ...edits, [i]: { ...t, title: e.target.value } })} style={{ fontWeight: 600 }} />
                  <div className="meta" style={{ marginTop: 8 }}>
                    <span className="tag">{t.workstream}</span>
                    <span className="tag">{t.phase}</span>
                    <input type="date" className="select inline" aria-label="Due date" value={t.due ?? ""} onChange={(e) => setEdits({ ...edits, [i]: { ...t, due: e.target.value || null } })} />
                  </div>
                  <div className="sub" style={{ marginTop: 8 }}>{t.details}</div>
                  <div className="why">Why: {t.why}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="actions">
            <label className="note" style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="checkbox" checked={saveNote} onChange={(e) => setSaveNote(e.target.checked)} /> Also save the research as a Notion page
            </label>
          </div>
          <div className="actions">
            <button
              className="btn btn-plum"
              disabled={pending || (chosen.length === 0 && !saveNote)}
              onClick={() => start(async () => setDone(await accept({ tasks: chosen, title: title || "Research note", research: text, summary: res.summary ?? "", saveNote })))}
            >
              {pending ? "Saving…" : `Add ${chosen.length} to Notion`}
            </button>
            <button className="btn btn-ghost" onClick={() => setRes(null)}>Back</button>
          </div>
        </>
      )}
    </div>
  );
}
