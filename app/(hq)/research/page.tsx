import { Topbar } from "@/components/Topbar";
import { Triage } from "@/components/Triage";
import { has } from "@/lib/config";
import { triageResearch, acceptTriage } from "../../actions";

export default function ResearchPage() {
  return (
    <>
      <Topbar crumb="Research inbox" />
      <div className="page">
        <section className="hero">
          <div className="kicker">Research inbox</div>
          <h1>Research doesn't need to become another list.</h1>
          <p>Paste what Claude found. You'll get a few concrete next steps, checked against what's already on your plate. Nothing is added until you approve it.</p>
        </section>
        <section className="card" style={{ marginTop: 28, maxWidth: 900 }}>
          <Triage triage={triageResearch} accept={acceptTriage} enabled={has.claude() && has.notion()} />
        </section>
      </div>
    </>
  );
}
