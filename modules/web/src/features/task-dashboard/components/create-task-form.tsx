import { AlertCircle } from "lucide-react";
import { useState } from "react";

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

  return (
    <section className="surface-card form-stack">
      {errorMessage ? (
        <div className="alert-card" role="alert">
          <span className="status-hint">
            <AlertCircle aria-hidden="true" size={16} /> Task creation failed
          </span>
          <p>{errorMessage}</p>
        </div>
      ) : null}
      <label className="field-stack">
        <span className="field-label">Task Spec</span>
        <textarea
          className="field-textarea"
          onChange={(event) => setTaskSpec(event.currentTarget.value)}
          placeholder="Describe the task to create"
          value={taskSpec}
        />
      </label>
      <label className="field-stack">
        <span className="field-label">Project Path</span>
        <input
          className="field-input"
          onChange={(event) => setProjectPath(event.currentTarget.value)}
          placeholder="/absolute/path/to/repo"
          value={projectPath}
        />
      </label>
      <div className="hero-actions">
        <button
          className="ui-button ui-button--ghost"
          disabled={isSubmitting}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="ui-button ui-button--primary"
          disabled={!trimmedProjectPath || !trimmedTaskSpec}
          onClick={() =>
            void onSubmit({
              projectPath: trimmedProjectPath,
              taskSpec: trimmedTaskSpec,
            })
          }
          type="button"
        >
          {isSubmitting ? "Creating..." : "Create Task"}
        </button>
      </div>
    </section>
  );
};
