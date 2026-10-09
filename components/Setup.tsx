export function Setup() {
  return (
    <section className="card" style={{ maxWidth: 760 }}>
      <div className="kicker">One-time setup</div>
      <h2 className="section-title">Connect Notion to bring this to life.</h2>
      <p className="note" style={{ fontSize: 15, marginTop: 10 }}>
        Ripe HQ reads and writes your existing Notion databases. Nothing gets copied anywhere else.
      </p>
      <ol style={{ lineHeight: 1.8, marginTop: 14, paddingLeft: 20 }}>
        <li>Go to <a href="https://www.notion.so/profile/integrations" target="_blank" rel="noreferrer">notion.so/profile/integrations</a> and create an internal integration called “Ripe HQ”.</li>
        <li>Copy its secret into Vercel as <code>NOTION_TOKEN</code>.</li>
        <li>In Notion, open each of these and use ••• → Connections → Ripe HQ: <b>Execution Tasks</b>, <b>Confirmed NYC / NJ Outreach</b>, <b>Target Pipeline</b>, <b>Content Tracker</b>, and the <b>Execution Roadmap</b> page.</li>
        <li>Redeploy. Then head to <a href="/settings">Connections</a> for Gmail, Calendar and Claude.</li>
      </ol>
    </section>
  );
}
