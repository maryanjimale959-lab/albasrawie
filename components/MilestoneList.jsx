"use client";
/** Milestone checklist: each checkbox posts toggleMilestone (insert / delete progress row). */
export default function MilestoneList({ action, projectId, milestones, done = [] }) {
  const doneSet = new Set(done);
  return (
    <div className="milestones">
      {milestones.map((m) => {
        const isDone = doneSet.has(m.id);
        return (
          <form key={m.id} action={action} className={`milestone ${isDone ? "done" : ""}`}>
            <input type="hidden" name="project_id" value={projectId} />
            <input type="hidden" name="milestone_id" value={m.id} />
            <label className="m-check grow">
              <input
                type="checkbox"
                defaultChecked={isDone}
                aria-label={m.title}
                onChange={(e) => { const f = e.currentTarget.form; if (f?.requestSubmit) f.requestSubmit(); }}
              />
              <span className="m-title">{m.title}</span>
            </label>
            <button className="btn ghost sm" type="submit">{isDone ? "Undo" : "Save"}</button>
          </form>
        );
      })}
    </div>
  );
}
