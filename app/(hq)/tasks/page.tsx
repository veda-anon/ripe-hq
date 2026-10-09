import { Topbar } from "@/components/Topbar";
import { TaskCheck, SelectAction, DateAction } from "@/components/client";
import { Setup } from "@/components/Setup";
import { has } from "@/lib/config";
import { getTasks } from "@/lib/notion";
import { relative, todayISO } from "@/lib/dates";
import { toggleTask, setTaskStatus, addTask } from "../../actions";
import { setTaskDueAction } from "./actions";

const PHASES = ["Phase 0", "Phase 1", "Phase 2", "Phase 3", "Content"];
const WORKSTREAMS = ["Research", "Legal", "Operations", "Growth", "Content", "Decision"];
const STATUSES = ["Not started", "In progress", "Waiting", "Done"];

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  if (!has.notion()) return (<><Topbar crumb="Tasks" /><div className="page"><Setup /></div></>);
  const { show } = await searchParams;
  const tasks = await getTasks({ includeDone: show === "all" });
  const today = todayISO();
  const groups = PHASES.map((p) => ({ phase: p, items: tasks.filter((t) => t.phase === p) }));
  const unphased = tasks.filter((t) => !t.phase || !PHASES.includes(t.phase));
  if (unphased.length) groups.push({ phase: "No phase", items: unphased });

  return (
    <>
      <Topbar crumb="Tasks" />
      <div className="page">
        <section className="hero">
          <div className="kicker">Execution Tasks · synced with Notion</div>
          <h1>Everything, in order.</h1>
          <p>Grouped by phase so you only look at what's in front of you. Changes here save straight to Notion.</p>
        </section>

        <section className="card" style={{ marginTop: 28 }}>
          <details className="inline">
            <summary>+ Add a task</summary>
            <form action={addTask} className="form-grid">
              <div className="field full"><label htmlFor="title">Task</label><input id="title" name="title" className="input" required placeholder="Start with a verb, e.g. Call 5 Bergen County centers" /></div>
              <div className="field"><label htmlFor="phase">Phase</label><select id="phase" name="phase" className="select" defaultValue="Phase 0">{PHASES.map((p) => <option key={p}>{p}</option>)}</select></div>
              <div className="field"><label htmlFor="workstream">Workstream</label><select id="workstream" name="workstream" className="select">{WORKSTREAMS.map((w) => <option key={w}>{w}</option>)}</select></div>
              <div className="field"><label htmlFor="due">Due</label><input id="due" type="date" name="due" className="input" /></div>
              <div className="field"><label htmlFor="details">What done looks like</label><input id="details" name="details" className="input" /></div>
              <div className="actions full"><button className="btn btn-plum">Add to Notion</button></div>
            </form>
          </details>
        </section>

        <div className="tabs">
          <a href="/tasks" className={show !== "all" ? "active" : ""}>Open</a>
          <a href="/tasks?show=all" className={show === "all" ? "active" : ""}>Include done</a>
        </div>

        <div className="grid" style={{ gap: 20 }}>
          {groups.filter((g) => g.items.length).map((g) => (
            <section className="card" key={g.phase}>
              <div className="card-head">
                <h2 className="section-title" style={{ fontSize: 24 }}>{g.phase}</h2>
                <span className="note">{g.items.length} {g.items.length === 1 ? "task" : "tasks"}</span>
              </div>
              <div className="list">
                {g.items.map((t) => {
                  const rel = relative(t.due, today);
                  return (
                    <div className={`row ${t.done ? "done" : ""}`} key={t.id}>
                      <TaskCheck done={t.done} label={t.title} onToggle={toggleTask.bind(null, t.id)} />
                      <div>
                        <div className="title"><a href={t.url} target="_blank" rel="noreferrer" style={{ textDecoration: "none" }}>{t.title}</a></div>
                        <div className="meta">
                          {t.workstream && <span className="tag">{t.workstream}</span>}
                          <SelectAction label="Status" value={t.status} options={STATUSES} onChange={setTaskStatus.bind(null, t.id)} />
                          <DateAction label="Due date" value={t.due} onChange={setTaskDueAction.bind(null, t.id)} />
                        </div>
                        {t.details && <div className="sub">{t.details}</div>}
                      </div>
                      <div className={`due ${rel.includes("late") && !t.done ? "late" : ""}`}>{rel}</div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {tasks.length === 0 && <p className="empty">No open tasks. Enjoy it.</p>}
        </div>
      </div>
    </>
  );
}
