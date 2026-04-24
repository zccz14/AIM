import { useState } from "react";

const checklistItems = [
  "Keep the brief focused on one coherent outcome.",
  "Use the task spec to explain user-visible value and boundaries.",
  "Point the task at the exact workspace path that should change.",
];

export const CreateTaskForm = ({
  errorMessage,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onSubmit: (input: {
    projectPath: string;
    taskSpec: string;
  }) => Promise<unknown> | unknown;
}) => {
  const [projectPath, setProjectPath] = useState("");
  const [taskSpec, setTaskSpec] = useState("");
  const trimmedProjectPath = projectPath.trim();
  const trimmedTaskSpec = taskSpec.trim();
  const canSubmit = Boolean(trimmedProjectPath && trimmedTaskSpec);

  return (
    <form
      className="aim-surface aim-task-form aim-stack"
      onSubmit={(event) => {
        event.preventDefault();

        if (!canSubmit || isSubmitting) {
          return;
        }

        void onSubmit({
          projectPath: trimmedProjectPath,
          taskSpec: trimmedTaskSpec,
        });
      }}
    >
      <header className="aim-task-form-header">
        <p className="aim-kicker">Create Task</p>
        <h2>Shape a focused brief before it leaves the dashboard.</h2>
        <p className="aim-task-summary aim-muted">
          Draft the task in the same branded workspace used for review, so the
          handoff into AIM stays readable in both light and dark themes.
        </p>
      </header>

      {errorMessage ? (
        <section className="aim-task-error" role="alert">
          <p className="aim-kicker">Request Blocked</p>
          <h3>{errorMessage}</h3>
          <p className="aim-muted">
            Adjust the task brief or project path, then retry from this panel.
          </p>
        </section>
      ) : null}

      <div className="aim-task-form-grid">
        <section className="aim-task-form-main">
          <div className="aim-stack">
            <div>
              <p className="aim-kicker">Task Brief</p>
              <h3>Task Spec</h3>
            </div>
            <div className="aim-field">
              <label htmlFor="create-task-spec">Task Spec</label>
              <textarea
                disabled={isSubmitting}
                id="create-task-spec"
                onChange={(event) => setTaskSpec(event.currentTarget.value)}
                placeholder="Describe the task to create"
                value={taskSpec}
              />
            </div>
          </div>
        </section>

        <aside className="aim-task-form-sidebar">
          <div className="aim-stack">
            <div>
              <p className="aim-kicker">Workspace Target</p>
              <h3>Project Path</h3>
            </div>
            <div className="aim-field">
              <label htmlFor="create-task-project-path">Project Path</label>
              <input
                disabled={isSubmitting}
                id="create-task-project-path"
                onChange={(event) => setProjectPath(event.currentTarget.value)}
                placeholder="/absolute/path/to/repo"
                type="text"
                value={projectPath}
              />
            </div>

            <div className="aim-stack">
              <div>
                <p className="aim-kicker">Submission Checklist</p>
                <h3>Before You Send</h3>
              </div>
              <div className="aim-checklist">
                {checklistItems.map((item) => (
                  <div className="aim-checklist-item" key={item}>
                    <span aria-hidden="true" className="aim-checkmark">
                      ✓
                    </span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <div className="aim-task-form-footer">
        <p className="aim-muted">
          The create flow keeps the existing API contract and trims accidental
          whitespace before submit.
        </p>
        <div className="aim-task-actions">
          <button
            className="aim-task-button aim-task-button-secondary"
            disabled={isSubmitting}
            onClick={onCancel}
            type="button"
          >
            Cancel
          </button>
          <button
            className="aim-task-button aim-task-button-primary"
            disabled={!canSubmit || isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Creating Task..." : "Create Task"}
          </button>
        </div>
      </div>
    </form>
  );
};
