import type { OpenCodeModelCombination } from "@aim-ai/contract";
import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.js";

const developerModelPreferenceKey = "aim.createTaskDeveloperModel";

const checklistItems = [
  "Keep the brief focused on one coherent outcome.",
  "Use the task spec to explain user-visible value and boundaries.",
  "Point the task at the exact workspace path that should change.",
];

export const CreateTaskForm = ({
  errorMessage,
  isSubmitting,
  models,
  onCancel,
  onSubmit,
}: {
  errorMessage: string | null;
  isSubmitting: boolean;
  models: OpenCodeModelCombination[];
  onCancel: () => void;
  onSubmit: (input: {
    title: string;
    projectPath: string;
    taskSpec: string;
    developerProviderId: string;
    developerModelId: string;
  }) => Promise<unknown> | unknown;
}) => {
  const [title, setTitle] = useState("");
  const [projectPath, setProjectPath] = useState("");
  const [taskSpec, setTaskSpec] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState("");
  const trimmedTitle = title.trim();
  const trimmedProjectPath = projectPath.trim();
  const trimmedTaskSpec = taskSpec.trim();
  const selectedModel = models.find(
    (model) => `${model.provider_id}::${model.model_id}` === selectedModelKey,
  );
  const canSubmit = Boolean(
    trimmedTitle && trimmedProjectPath && trimmedTaskSpec && selectedModel,
  );

  useEffect(() => {
    if (models.length === 0 || selectedModelKey) {
      return;
    }

    const savedPreference = localStorage.getItem(developerModelPreferenceKey);
    const savedModel = savedPreference
      ? (JSON.parse(savedPreference) as {
          modelId?: string;
          providerId?: string;
        })
      : null;
    const preferredModel = savedModel
      ? models.find(
          (model) =>
            model.provider_id === savedModel.providerId &&
            model.model_id === savedModel.modelId,
        )
      : null;
    const initialModel = preferredModel ?? models[0];

    if (!initialModel) {
      return;
    }

    setSelectedModelKey(
      `${initialModel.provider_id}::${initialModel.model_id}`,
    );
  }, [models, selectedModelKey]);

  return (
    <form
      className="aim-surface aim-task-form aim-stack"
      onSubmit={(event) => {
        event.preventDefault();

        if (!canSubmit || isSubmitting || !selectedModel) {
          return;
        }

        void onSubmit({
          title: trimmedTitle,
          projectPath: trimmedProjectPath,
          taskSpec: trimmedTaskSpec,
          developerProviderId: selectedModel.provider_id,
          developerModelId: selectedModel.model_id,
        });

        localStorage.setItem(
          developerModelPreferenceKey,
          JSON.stringify({
            providerId: selectedModel.provider_id,
            modelId: selectedModel.model_id,
          }),
        );
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
              <label htmlFor="create-task-title">Title</label>
              <input
                disabled={isSubmitting}
                id="create-task-title"
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Summarize the task"
                type="text"
                value={title}
              />
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

            <div className="aim-field">
              <label htmlFor="create-task-developer-model">
                Developer Model
              </label>
              <select
                disabled={isSubmitting || models.length === 0}
                id="create-task-developer-model"
                onChange={(event) =>
                  setSelectedModelKey(event.currentTarget.value)
                }
                value={selectedModelKey}
              >
                {models.length === 0 ? (
                  <option value="">No models available</option>
                ) : null}
                {models.map((model) => (
                  <option
                    key={`${model.provider_id}::${model.model_id}`}
                    value={`${model.provider_id}::${model.model_id}`}
                  >
                    {model.provider_name} / {model.model_name}
                  </option>
                ))}
              </select>
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
          <Button disabled={isSubmitting} onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit || isSubmitting} type="submit">
            {isSubmitting ? "Creating Task..." : "Create Task"}
          </Button>
        </div>
      </div>
    </form>
  );
};
