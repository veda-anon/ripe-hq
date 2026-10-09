import { Topbar } from "@/components/Topbar";
import { Setup } from "@/components/Setup";
import { SelectAction, DateAction } from "@/components/client";
import { has } from "@/lib/config";
import { getContent } from "@/lib/notion";
import { fmtShort, todayISO } from "@/lib/dates";
import { setPostStatus, setPostDate } from "../../actions";

const STATUSES = ["Idea", "Scripted", "Filmed", "Edited", "Scheduled", "Posted"];

// From the Execution Roadmap's content operating rhythm
const RHYTHM: Record<number, string> = {
  1: "Price-shock reel on TikTok + Instagram. 20 min commenting on running/fitness creators.",
  2: "Founder reel on TikTok, explainer carousel on Instagram, one Reddit answer.",
  3: "Explainer reel cross-posted, Instagram story poll, one PT / chiro / run-club DM.",
  4: "Price-shock TikTok and a lifestyle/photo Instagram post.",
  5: "Founder reel cross-posted. Video replies to comments.",
  6: "Recut the week's strongest hook for TikTok. Story with waitlist count + city poll.",
  0: "Batch-film next week (2 hours) and review the scorecard.",
};

export default async function ContentPage() {
  if (!has.notion()) return (<><Topbar crumb="Content" /><div className="page"><Setup /></div></>);
  const posts = await getContent();
  const today = todayISO();
  const dow = new Date(today + "T12:00:00Z").getUTCDay();
  const posted = posts.filter((p) => p.status === "Posted");
  const sum = (k: "views" | "signups" | "clicks") => posted.reduce((a, p) => a + (p[k] ?? 0), 0);

  return (
    <>
      <Topbar crumb="Content" />
      <div className="page">
        <section className="hero">
          <div className="kicker">Demand · TikTok + Instagram</div>
          <h1>Make it, post it, learn.</h1>
          <p>Your Content Tracker as a board. Move a post along by changing its status, and give it a date so it shows up on Today.</p>
        </section>

        <div className="grid stats">
          <div className="card stat olive" style={{ gridColumn: "span 2" }}>
            <div className="kicker">Today's rhythm</div>
            <p style={{ fontFamily: "var(--display)", fontSize: 24, lineHeight: 1.25, marginTop: 10 }}>{RHYTHM[dow]}</p>
          </div>
          <div className="card stat"><div className="kicker">Posted</div><div className="num">{posted.length}</div><div className="foot">of {posts.length} in the tracker</div></div>
          <div className="card stat"><div className="kicker">Signups from posts</div><div className="num">{sum("signups")}</div><div className="foot">{sum("views").toLocaleString()} views · {sum("clicks")} link clicks</div></div>
        </div>

        <section style={{ marginTop: 28 }}>
          <div className="kanban">
            {STATUSES.map((s) => {
              const items = posts.filter((p) => (p.status ?? "Idea") === s);
              return (
                <div className="col" key={s}>
                  <h3>{s}<span>{items.length}</span></h3>
                  {items.map((p) => (
                    <div className="post" key={p.id}>
                      <a href={p.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none", fontWeight: 500 }}>{p.title}</a>
                      {p.hook && <div className="note" style={{ marginTop: 4 }}>“{p.hook.slice(0, 90)}{p.hook.length > 90 ? "…" : ""}”</div>}
                      <div className="meta">
                        {p.pillar && <span className="tag">{p.pillar}</span>}
                        {p.format && <span className="tag">{p.format}</span>}
                        {p.week != null && <span className="tag">Wk {p.week}</span>}
                      </div>
                      <div className="meta">
                        <SelectAction label="Status" value={p.status} options={STATUSES} onChange={setPostStatus.bind(null, p.id)} />
                        <DateAction label="Post date" value={p.postDate} onChange={setPostDate.bind(null, p.id)} />
                      </div>
                      {p.status === "Posted" && (p.views != null || p.signups != null) && (
                        <div className="note" style={{ marginTop: 6 }}>{p.views ?? 0} views · {p.saves ?? 0} saves · {p.signups ?? 0} signups</div>
                      )}
                      {p.postDate && p.status !== "Posted" && <div className="note" style={{ marginTop: 6 }}>Planned {fmtShort(p.postDate)}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
