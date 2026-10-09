"use client";
import { useActionState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { login } from "../actions";
import { Mark } from "@/components/Mark";

function Form() {
  const [state, action, pending] = useActionState(login, undefined as { error?: string } | undefined);
  const next = useSearchParams().get("next") ?? "/";
  return (
    <form action={action} className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <Mark />
        <span style={{ fontFamily: "var(--logo)", fontSize: 30 }}>ripe</span>
      </div>
      <h1 style={{ fontFamily: "var(--display)", fontSize: 32, lineHeight: 1.1 }}>Welcome back.</h1>
      <input type="hidden" name="next" value={next} />
      <div className="field" style={{ marginTop: 18 }}>
        <label htmlFor="pw">Password</label>
        <input id="pw" name="password" type="password" className="input" autoFocus required />
      </div>
      <div className="actions"><button className="btn btn-plum" disabled={pending}>{pending ? "Opening…" : "Open Ripe HQ"}</button></div>
      {state?.error && <div className="msg err">{state.error}</div>}
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="login">
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
