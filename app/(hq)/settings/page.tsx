import { Topbar } from "@/components/Topbar";
import { RunAgents } from "@/components/client";
import { env, has } from "@/lib/config";
import * as N from "@/lib/notion";
import * as G from "@/lib/google";
import { runAgentsNow, logout } from "../../actions";

export default async function SettingsPage() {
  const notionOk = has.notion() ? await N.ping() : false;
  const googleEmail = has.google() ? await G.ping() : null;

  const Row = ({ ok, name, children }: { ok: boolean; name: string; children: React.ReactNode }) => (
    <div className="row plain">
      <div>
        <div className="title" style={{ display: "flex", alignItems: "center", gap: 8 }}><span className={`dot ${ok ? "on" : "off"}`} /> {name}</div>
        <div className="sub" style={{ lineHeight: 1.6 }}>{children}</div>
      </div>
    </div>
  );

  return (
    <>
      <Topbar crumb="Connections" />
      <div className="page">
        <section className="hero">
          <div className="kicker">Connections</div>
          <h1>What Ripe HQ is plugged into.</h1>
        </section>

        <div className="grid two">
          <section className="card">
            <div className="list">
              <Row ok={notionOk} name="Notion">
                {notionOk ? "Reading and writing Execution Tasks, Outreach, Target Pipeline and Content Tracker." : has.notion() ? "Token is set, but Notion refused. Share the four databases with the Ripe HQ integration (••• → Connections)." : "Add NOTION_TOKEN in Vercel."}
              </Row>
              <Row ok={!!googleEmail} name="Gmail + Google Calendar + Drive">
                {googleEmail ? (
                  <>Connected as <b>{googleEmail}</b>. Clinic emails send from this address.</>
                ) : env.googleClientId ? (
                  <>Client is set. <a href="/api/google/auth">Connect your Google account →</a> then paste the refresh token into Vercel.</>
                ) : (
                  "Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Vercel (setup steps are in the README)."
                )}
              </Row>
              <Row ok={has.claude()} name="Claude (drafting + research triage)">
                {has.claude() ? `Using ${env.anthropicModel}.` : "Add ANTHROPIC_API_KEY from console.anthropic.com."}
              </Row>
              <Row ok={!!env.waitlistSheetId} name="Waitlist sheet">
                {env.waitlistSheetId ? "Reading signups from the Ripe Waitlist sheet." : "Add WAITLIST_SHEET_ID (the long ID in the Ripe Waitlist sheet's URL)."}
              </Row>
              <Row ok={!!googleEmail} name="Instinct and Muse">
                Neither has a public API, so Ripe HQ teaches them through the Google account they already read: “Ripe:” events on your calendar, a morning brief email, and a Google Doc called “Ripe HQ: Context for my assistants”.
                {env.assistantEmail ? <> Brief is also sent to <b>{env.assistantEmail}</b>.</> : " Set ASSISTANT_EMAIL to Instinct's dedicated address to send it the brief directly."}
              </Row>
            </div>
          </section>

          <div className="grid" style={{ gap: 20 }}>
            <section className="card brick">
              <div className="kicker">Daily agents · 7:00am ET</div>
              <p style={{ margin: "10px 0 16px", fontSize: 14 }}>
                Reply check → follow-up drafts → calendar → morning brief → assistant doc. Runs by itself every morning. Run it now to test.
              </p>
              <RunAgents run={runAgentsNow} />
            </section>
            <section className="card">
              <form action={logout}><button className="btn btn-ghost">Log out</button></form>
            </section>
          </div>
        </div>
      </div>
    </>
  );
}
