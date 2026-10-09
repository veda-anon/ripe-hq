import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { Setup } from "@/components/Setup";
import { Compose } from "@/components/Compose";
import { SelectAction, DateAction, RunAgents } from "@/components/client";
import { has, ACCOUNT_LABEL } from "@/lib/config";
import * as N from "@/lib/notion";
import * as G from "@/lib/google";
import { fmtShort, relative, todayISO } from "@/lib/dates";
import { sendOutreach, aiFirstDraft, approveDraft, discardDraft, setOutreachStatus, logCall, runAgentsNow } from "../../actions";
import { setFollowUpAction } from "./actions";

const OUT_STATUSES = ["Sent", "Replied", "Meeting", "No response", "Dead"];

export default async function OutreachPage({ searchParams }: { searchParams: Promise<{ tab?: string; row?: string }> }) {
  if (!has.notion()) return (<><Topbar crumb="Clinic outreach" /><div className="page"><Setup /></div></>);
  const { tab = "inbox", row } = await searchParams;
  const today = todayISO();
  const rows = await N.getOutreach();
  const due = N.followUpsDue(rows, today);
  const unsent = rows.filter((r) => !r.dateSent);

  let drafts: G.Draft[] = [];
  let senders: { account: string; email: string | null }[] = [];
  let gErr = "";
  if (has.google()) {
    try {
      senders = await G.accountEmails();
      drafts = await G.listDraftsTo(rows.map((r) => r.sentTo).filter(Boolean) as string[]);
    } catch (e: any) {
      gErr = e?.message ?? String(e);
    }
  }
  const draftFor = new Set(drafts.map((d) => d.to));
  const centerFor = (email: string) => rows.find((r) => r.sentTo?.toLowerCase() === email)?.center ?? email;

  const tabs = [
    { id: "inbox", label: `Needs you${drafts.length + due.length ? ` (${drafts.length + due.filter((d) => !draftFor.has(d.sentTo?.toLowerCase() ?? "")).length})` : ""}` },
    { id: "new", label: "New email" },
    { id: "calls", label: "Call queue" },
    { id: "pipeline", label: "All clinics" },
  ];

  return (
    <>
      <Topbar crumb="Clinic outreach" />
      <div className="page">
        <section className="hero">
          <div className="kicker">Supply · NYC / NJ imaging centers</div>
          <h1>Good conversations start here.</h1>
          <p>
            {rows.filter((r) => r.dateSent).length} clinics emailed, {rows.filter((r) => r.status === "Replied" || r.status === "Meeting").length} replied.
            Agents draft follow-ups; nothing goes out until you hit send.
          </p>
        </section>

        <nav className="tabs">
          {tabs.map((t) => <Link key={t.id} href={`/outreach?tab=${t.id}`} className={tab === t.id ? "active" : ""}>{t.label}</Link>)}
        </nav>

        {gErr && <div className="banner"><b>Gmail didn't load:</b> {gErr}</div>}
        {!has.google() && <div className="banner"><b>Gmail isn't connected yet.</b> You can still track clinics here. <Link href="/settings">Connect Google</Link> to send and get agent drafts.</div>}

        {tab === "inbox" && (
          <div className="grid two" style={{ marginTop: 0 }}>
            <section className="card">
              <div className="kicker">Waiting for your OK</div>
              <h2 className="section-title" style={{ marginBottom: 16 }}>Drafted follow-ups</h2>
              {drafts.length === 0 && <p className="empty">No drafts right now. The agent writes them each morning for clinics whose follow-up date has arrived.</p>}
              {drafts.map((d) => (
                <form key={d.id} action={approveDraft} className="draft">
                  <input type="hidden" name="draftId" value={d.id} />
                  <input type="hidden" name="account" value={d.account} />
                  <input type="hidden" name="to" value={d.to} />
                  <input type="hidden" name="threadId" value={d.threadId ?? ""} />
                  <input type="hidden" name="inReplyTo" value={d.inReplyTo ?? ""} />
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                    <b>{centerFor(d.to)}</b><span className="note">to {d.to} · from {ACCOUNT_LABEL[d.account]}</span>
                  </div>
                  <input name="subject" className="input" defaultValue={d.subject} aria-label="Subject" style={{ marginBottom: 8 }} />
                  <textarea name="body" className="textarea" defaultValue={d.body} aria-label="Message" />
                  <div className="actions">
                    <button className="btn btn-plum btn-sm">Looks good, send</button>
                    <button className="btn btn-ghost btn-sm" formAction={discardDraft}>Discard</button>
                  </div>
                </form>
              ))}
            </section>

            <div className="grid" style={{ gap: 20 }}>
              <section className="card">
                <div className="kicker">Follow-up date has arrived</div>
                <h2 className="section-title" style={{ marginBottom: 12 }}>Due follow-ups</h2>
                {due.length === 0 && <p className="empty">You're caught up.</p>}
                <div className="list">
                  {due.map((o) => (
                    <div className="row plain" key={o.id}>
                      <div>
                        <div className="title">{o.center}</div>
                        <div className="sub">Emailed {fmtShort(o.dateSent)} · follow up {relative(o.followUpOn, today)}</div>
                        <div className="meta">
                          {draftFor.has(o.sentTo?.toLowerCase() ?? "") ? <span className="tag olive">Draft ready</span> : <span className="tag rust">No draft yet</span>}
                          <SelectAction label="Status" value={o.status} options={OUT_STATUSES} onChange={setOutreachStatus.bind(null, o.id)} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section className="card brick">
                <div className="kicker">Follow-up agent</div>
                <p style={{ margin: "8px 0 14px", fontSize: 14 }}>Checks Gmail for replies (and marks them in Notion), then drafts anything that's due.</p>
                <RunAgents run={runAgentsNow} />
              </section>
            </div>
          </div>
        )}

        {tab === "new" && (
          <section className="card" style={{ maxWidth: 820 }}>
            <Compose
              send={sendOutreach}
              aiDraft={aiFirstDraft}
              claudeOn={has.claude()}
              senders={senders.map((x) => ({ value: x.account, label: `${ACCOUNT_LABEL[x.account as keyof typeof ACCOUNT_LABEL]}${x.email ? ` (${x.email})` : ""}` }))}
              defaultFrom={has.google() ? G.defaultSendFrom() : ""}
              unsent={unsent.map((u) => ({ id: u.id, center: u.center, contact: u.contact, to: u.sentTo, notes: u.notes }))}
              prefill={(() => {
                const r = rows.find((x) => x.id === row);
                return r ? { outreachId: r.id, center: r.center, contact: r.contact, to: r.sentTo ?? "", notes: r.notes } : {};
              })()}
            />
          </section>
        )}

        {tab === "calls" && <Calls />}

        {tab === "pipeline" && (
          <section className="card">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Center</th><th>Contact</th><th>Sent</th><th>Status</th><th>Follow up</th><th>Latest note</th></tr></thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id}>
                      <td><a href={o.url} target="_blank" rel="noreferrer">{o.center}</a>{o.website && <div className="note"><a href={o.website} target="_blank" rel="noreferrer">site</a></div>}</td>
                      <td>{o.contact || <span className="note">{o.contactType}</span>}<div className="note">{o.sentTo}</div></td>
                      <td>{o.dateSent ? fmtShort(o.dateSent) : <Link href={`/outreach?tab=new&row=${o.id}`} className="btn-link">Write email</Link>}</td>
                      <td><SelectAction label="Status" value={o.status} options={OUT_STATUSES} onChange={setOutreachStatus.bind(null, o.id)} /></td>
                      <td><DateAction label="Follow up on" value={o.followUpOn} onChange={setFollowUpAction.bind(null, o.id)} /></td>
                      <td className="note" style={{ maxWidth: 280 }}>{o.notes.split("\n").pop()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

async function Calls() {
  const [callbacks, queue] = await Promise.all([N.getCallbacks(), N.getCallQueue(8)]);
  const today = todayISO();
  const block = (t: N.Target, kind: "callback" | "new") => (
    <div className="row plain" key={t.id}>
      <div>
        <div className="title">{t.center} <span className="note">· {t.city}{t.state ? `, ${t.state}` : ""}{t.rank ? ` · rank ${t.rank}` : ""}</span></div>
        <div className="sub">
          {t.phone ? <a href={`tel:${t.phone}`}>{t.phone}</a> : "No phone on file"}
          {kind === "callback" && t.callback ? ` · callback ${relative(t.callback, today)}` : ""}
          {t.nextStep ? ` · next: ${t.nextStep}` : ""}
        </div>
        {kind === "new" && t.scoreBasis && <div className="sub">{t.scoreBasis}</div>}
        <details className="inline" style={{ marginTop: 8 }}>
          <summary>Log this call</summary>
          <form action={logCall} className="form-grid">
            <input type="hidden" name="id" value={t.id} />
            <div className="field full">
              <label>What happened?</label>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
                <label><input type="radio" name="outcome" value="voicemail" defaultChecked /> Voicemail / no answer</label>
                <label><input type="radio" name="outcome" value="reached" /> Talked to someone</label>
                <label><input type="radio" name="outcome" value="meeting" /> Booked a meeting</label>
                <label><input type="radio" name="outcome" value="dead" /> Not a fit</label>
              </div>
            </div>
            <div className="field"><label htmlFor={`ab-${t.id}`}>Who answered</label><input id={`ab-${t.id}`} name="answeredBy" className="input" placeholder="Front desk, imaging manager…" /></div>
            <div className="field"><label htmlFor={`cb-${t.id}`}>Call back on</label><input id={`cb-${t.id}`} name="callback" type="date" className="input" /></div>
            <div className="field full"><label htmlFor={`ns-${t.id}`}>Next step</label><input id={`ns-${t.id}`} name="nextStep" className="input" /></div>
            <div className="field full"><label htmlFor={`n-${t.id}`}>Notes</label><textarea id={`n-${t.id}`} name="notes" className="textarea" style={{ minHeight: 80 }} placeholder="Takes self-pay? 1.5T or 3T? Already partnered? Owner?" /></div>
            <div className="actions full"><button className="btn btn-plum btn-sm">Save to Notion</button><span className="note">Voicemail with no date sets a callback 2 business days out.</span></div>
          </form>
        </details>
      </div>
    </div>
  );
  return (
    <div className="grid two" style={{ marginTop: 0 }}>
      <section className="card">
        <div className="kicker">Target Pipeline · Call Queue view</div>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Next to dial</h2>
        <div className="list">{queue.length ? queue.map((t) => block(t, "new")) : <p className="empty">Queue is empty.</p>}</div>
      </section>
      <section className="card">
        <div className="kicker">Callbacks</div>
        <h2 className="section-title" style={{ marginBottom: 12 }}>Try again</h2>
        <div className="list">{callbacks.length ? callbacks.map((t) => block(t, "callback")) : <p className="empty">No callbacks pending.</p>}</div>
      </section>
    </div>
  );
}
