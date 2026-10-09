import { has } from "@/lib/config";

export function Topbar({ crumb }: { crumb: string }) {
  const s = [
    { label: "Notion", on: has.notion() },
    { label: "Gmail + Calendar", on: has.google() },
    { label: "Claude", on: has.claude() },
  ];
  return (
    <header className="topbar">
      <div className="crumbs">Ripe › <b>{crumb}</b></div>
      <div className="pills">
        {s.map((x) => (
          <a key={x.label} href="/settings" className="pill" style={{ textDecoration: "none" }}>
            <span className={`dot ${x.on ? "on" : "off"}`} />
            {x.label}
          </a>
        ))}
      </div>
    </header>
  );
}
