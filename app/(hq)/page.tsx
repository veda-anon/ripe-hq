import Link from "next/link";
import { Topbar } from "@/components/Topbar";
import { TaskCheck, RunAgents } from "@/components/client";
import { loadToday } from "@/lib/data";
import { fmtLong, fmtShort, relative } from "@/lib/dates";
import { toggleTask, runAgentsNow } from "../actions";
import { Setup } from "@/components/Setup";

function greeting(lateCount: number, focusCount: number) {
  if (lateCount > 3) return "Let's catch up, one at a time.";
  if (focusCount === 0) return "A clear runway today.";
  return "A clear start to today.";
}

export default async function TodayPage() {
  const d = await loadToday();
  if (!d.ready) {
    return (
      <>
        <Topbar crumb="Today" />
        <div className="page"><Setup /></div>
      </>
    );
  }
  const s = d.stats;
  const nextCall = d.callbacks[0] ?? d.callQueue[0];

  return (
    <>
      <Topbar crumb="Today" />
      <div className="page">
        <section className="hero">
          <div className="kicker">{fmtLong(d.today)}</div>
          <h1>{greeting(d.overdue.length, d.focus.length)}</h1>
          <p>
            {d.focus.length
              ? d.focus.length === 1 ? "One thing matters most today. The rest can wait." : `${Math.min(3, d.focus.length)} things matter most right now. The rest can wait.`
              : "Nothing is due. Good day to get ahead on Phase 1 prep."}
          </p>
        </section>

        {d.errors.length > 0 && (
          <div className="banner"><b>Some data didn't load:</b> {d.errors.join(" · ")}</div>
        )}

        <div className="grid stats">
          <div className={`card stat ${s.overdue ? "alert" : ""}`}>
            <div className="kicker">Needs you</div>
            <div className="num">{s.overdue + d.dueToday.length}</div>
            <div className="foot">{s.overdue} late · {d.dueToday.length} due today</div>
          </div>
          <div className="card stat">
            <div className="kicker">Open tasks</div>
            <div className="num">{s.open}</div>
            <div className="foot">{s.dueSoon} due in the next 3 days</div>
          </div>
          <div className="card stat">
            <div className="kicker">Clinic follow-ups</div>
            <div className="num">{s.followUps + d.callbacks.length}</div>
            <div className="foot">{s.followUps} emails · {d.callbacks.length} callbacks</div>
          </div>
          <div className="card stat">
            <div className="kicker">Waitlist</div>
            {d.waitlist ? <div className="num">{d.waitlist.total}</div> : <div className="num" style={{ fontSize: 24, marginTop: 24 }}>Not linked</div>}
            <div className="foot">{d.waitlist ? `+${d.waitlist.last7} this week` : "Connect the sheet in Settings"}</div>
          </div>
        </div>

        <div className="grid two">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="kicker">Your next few steps</div>
                <h2 className="section-title">Keep the momentum gentle.</h2>
              </div>
              <Link className="more" href="/tasks">All tasks →</Link>
            </div>
            <div className="list">
              {d.focus.length === 0 && <p className="empty">Nothing late or due soon.</p>}
              {d.focus.map((t, i) => {
                const rel = relative(t.due, d.today);
                const late = rel.includes("late");
                return (
                  <div className="row" key={t.id}>
                    <TaskCheck done={false} label={t.title} onToggle={toggleTask.bind(null, t.id)} />
                    <div>
                      <div className="title">
                        {i < 3 && <span style={{ color: "var(--rust)", fontWeight: 700, marginRight: 6 }}>{i + 1}.</span>}
                        {t.title}
                      </div>
                      <div className="meta">
                        {t.workstream && <span className="tag">{t.workstream}</span>}
                        {t.phase && <span className="tag">{t.phase}</span>}
                        {t.status === "In progress" && <span className="tag olive">In progress</span>}
                        {t.status === "Waiting" && <span className="tag">Waiting</span>}
                      </div>
                      {t.details && <div className="sub">{t.details.slice(0, 160)}{t.details.length > 160 ? "…" : ""}</div>}
                    </div>
                    <div className={`due ${late ? "late" : ""}`}>{t.due ? `${fmtShort(t.due)} · ${rel}` : ""}</div>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="grid" style={{ gap: 20 }}>
            <section className="card olive">
              <div className="kicker">Supply pulse</div>
              <h2 className="section-title">Good conversations start here.</h2>
              <div className="mini-stats">
                <div><b>{s.outreachSent}</b><span>Emailed</span></div>
                <div><b>{s.replies + s.meetings}</b><span>Replied</span></div>
                <div><b>{d.drafts.length}</b><span>Drafts to OK</span></div>
              </div>
              {nextCall && (
                <p style={{ fontSize: 14, marginBottom: 14 }}>
                  Next call: <b>{nextCall.center}</b>{nextCall.city ? `, ${nextCall.city}` : ""}{nextCall.phone ? ` · ${nextCall.phone}` : ""}
                </p>
              )}
              <Link href="/outreach" className="btn btn-cream" style={{ width: "100%" }}>Open clinic outreach ↗</Link>
            </section>

            <section className="card brick">
              <div className="kicker">Agents</div>
              <h2 className="section-title" style={{ marginBottom: 8 }}>Your overnight crew.</h2>
              <p style={{ fontSize: 14, marginBottom: 16 }}>
                Every morning they check Gmail for clinic replies, draft follow-ups for your OK, put today on your calendar, and brief Instinct and Muse.
              </p>
              <RunAgents run={runAgentsNow} />
            </section>
          </div>
        </div>

        <div className="grid two">
          <section className="card">
            <div className="card-head">
              <div>
                <div className="kicker">Demand</div>
                <h2 className="section-title">Content this week</h2>
              </div>
              <Link className="more" href="/content">Content board →</Link>
            </div>
            <div className="list">
              {d.contentThisWeek.length === 0 && (
                <p className="empty">
                  No posts have a date this week. {d.contentUnscheduled.length} drafts are waiting for one on the content board.
                </p>
              )}
              {d.contentThisWeek.map((p) => (
                <div className="row plain" key={p.id}>
                  <div>
                    <div className="title">{p.title}</div>
                    <div className="meta">
                      {p.pillar && <span className="tag">{p.pillar}</span>}
                      {p.format && <span className="tag">{p.format}</span>}
                      <span className={`tag ${p.status === "Posted" ? "olive" : ""}`}>{p.status}</span>
                    </div>
                  </div>
                  <div className="due">{fmtShort(p.postDate)}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <div className="kicker">Research inbox</div>
                <h2 className="section-title">Research becomes next steps.</h2>
              </div>
            </div>
            <p className="note" style={{ fontSize: 14, marginBottom: 16 }}>
              Paste anything Claude found for you. You'll get a short list of proposed tasks, and you approve each one before it lands in Notion.
            </p>
            <Link href="/research" className="btn btn-plum">Triage research →</Link>
          </section>
        </div>
      </div>
    </>
  );
}
