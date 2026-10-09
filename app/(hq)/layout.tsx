import { Sidebar } from "@/components/Sidebar";
import { has } from "@/lib/config";
import { getOutreach, followUpsDue } from "@/lib/notion";

export const dynamic = "force-dynamic";

export default async function HQLayout({ children }: { children: React.ReactNode }) {
  let followUps = 0;
  if (has.notion()) {
    try {
      followUps = followUpsDue(await getOutreach()).length;
    } catch {}
  }
  return (
    <div className="shell">
      <Sidebar badges={{ outreach: followUps }} />
      <div className="main">{children}</div>
    </div>
  );
}
