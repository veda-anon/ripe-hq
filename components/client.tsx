"use client";
import { useOptimistic, useState, useTransition } from "react";

export function TaskCheck({ done, onToggle, label }: { done: boolean; onToggle: (done: boolean) => Promise<void>; label: string }) {
  const [opt, setOpt] = useOptimistic(done);
  const [, start] = useTransition();
  return (
    <button
      type="button"
      className={`check ${opt ? "on" : ""}`}
      aria-pressed={opt}
      aria-label={`${opt ? "Reopen" : "Complete"}: ${label}`}
      onClick={() =>
        start(async () => {
          setOpt(!opt);
          await onToggle(!opt);
        })
      }
    />
  );
}

export function SelectAction({ value, options, onChange, label }: { value: string | null; options: string[]; onChange: (v: string) => Promise<void>; label: string }) {
  const [pending, start] = useTransition();
  const [v, setV] = useState(value ?? "");
  return (
    <select
      className="select inline"
      aria-label={label}
      value={v}
      disabled={pending}
      onChange={(e) => {
        const nv = e.target.value;
        setV(nv);
        start(() => onChange(nv));
      }}
    >
      {!value && <option value="">Pick one</option>}
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  );
}

export function DateAction({ value, onChange, label }: { value: string | null; onChange: (v: string) => Promise<void>; label: string }) {
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      className="select inline"
      aria-label={label}
      defaultValue={value?.slice(0, 10) ?? ""}
      disabled={pending}
      onChange={(e) => {
        const nv = e.target.value;
        start(() => onChange(nv));
      }}
    />
  );
}

export function ActionButton({ children, onRun, className = "btn btn-ghost btn-sm" }: { children: React.ReactNode; onRun: () => Promise<unknown>; className?: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" className={className} disabled={pending} onClick={() => start(async () => { await onRun(); })}>
      {pending ? "Working…" : children}
    </button>
  );
}

export function RunAgents({ run }: { run: () => Promise<{ lines: string[]; errors: string[] }> }) {
  const [pending, start] = useTransition();
  const [out, setOut] = useState<{ lines: string[]; errors: string[] } | null>(null);
  return (
    <div>
      <button className="btn btn-cream" disabled={pending} onClick={() => start(async () => setOut(await run()))}>
        {pending ? "Agents are working…" : "Run agents now"}
      </button>
      {out && (
        <div style={{ marginTop: 14, fontSize: 14 }}>
          {out.lines.map((l, i) => <p key={i} style={{ marginTop: 4 }}>✓ {l}</p>)}
          {out.errors.map((l, i) => <p key={i} style={{ marginTop: 4, opacity: 0.85 }}>! {l}</p>)}
        </div>
      )}
    </div>
  );
}
