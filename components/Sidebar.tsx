"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Mark } from "./Mark";

const I = {
  today: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/><circle cx="12" cy="14.5" r="1.6" fill="currentColor" stroke="none"/></svg>,
  tasks: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 6.5l1.6 1.6L8.5 5M4 12.5l1.6 1.6 2.9-3.1M4 18.5l1.6 1.6 2.9-3.1M11.5 7h8.5M11.5 13h8.5M11.5 19h8.5"/></svg>,
  supply: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4 7l8 6 8-6"/><rect x="3.5" y="5" width="17" height="14" rx="2.5"/></svg>,
  content: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M10 9.5l5 2.5-5 2.5z" fill="currentColor"/></svg>,
  research: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z"/><path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg>,
  settings: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>,
};

export function Sidebar({ badges }: { badges: Partial<Record<string, number>> }) {
  const path = usePathname();
  const items = [
    { href: "/", label: "Today", icon: I.today },
    { href: "/tasks", label: "Tasks", icon: I.tasks },
    { href: "/outreach", label: "Clinic outreach", icon: I.supply, badge: badges.outreach },
    { href: "/content", label: "Content", icon: I.content },
    { href: "/research", label: "Research inbox", icon: I.research },
    { href: "/settings", label: "Connections", icon: I.settings },
  ];
  return (
    <aside className="side">
      <Link href="/" className="brand">
        <Mark />
        <div>
          <span className="word">ripe</span>
          <span className="sub">Launch HQ</span>
        </div>
      </Link>
      <nav className="nav" aria-label="Main">
        <div className="nav-label">Founder desk</div>
        {items.map((it) => {
          const active = it.href === "/" ? path === "/" : path.startsWith(it.href);
          return (
            <Link key={it.href} href={it.href} className={active ? "active" : ""} title={it.label}>
              {it.icon}
              <span>{it.label}</span>
              {it.badge ? <em className="badge" style={{ fontStyle: "normal" }}>{it.badge}</em> : null}
            </Link>
          );
        })}
      </nav>
      <div className="side-foot">
        <h3>Three things a day is a good day.</h3>
        <p>Everything here writes back to Notion, so this is the only tab you need open.</p>
      </div>
    </aside>
  );
}
