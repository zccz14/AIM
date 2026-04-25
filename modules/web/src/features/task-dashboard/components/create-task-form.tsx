import type { OpenCodeModelCombination } from "@aim-ai/contract";
import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Input } from "../../../components/ui/input.js";
import { Label } from "../../../components/ui/label.js";
import {
  LyraKicker,
  LyraMuted,
  LyraPanel,
  LyraStack,
  LyraSurface,
} from "../../../components/ui/lyra-surface.js";
import { Select } from "../../../components/ui/select.js";
import { Textarea } from "../../../components/ui/textarea.js";

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
    <LyraSurface
      as="form"
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
        <LyraKicker>Create Task</LyraKicker>
        <h2>Shape a focused brief before it leaves the dashboard.</h2>
        <LyraMuted className="aim-task-summary">
          Draft the task in the same branded workspace used for review, so the
          handoff into AIM stays readable in both light and dark themes.
        </LyraMuted>
      </header>

      {errorMessage ? (
        <section className="aim-task-error" role="alert">
          <LyraKicker>Request Blocked</LyraKicker>
          <h3>{errorMessage}</h3>
          <LyraMuted>
            Adjust the task brief or project path, then retry from this panel.
          </LyraMuted>
        </section>
      ) : null}

      <div className="aim-task-form-grid">
        <LyraPanel className="aim-task-form-main">
          <LyraStack>
            <div>
              <LyraKicker>Task Brief</LyraKicker>
              <h3>Task Spec</h3>
            </div>
            <Label htmlFor="create-task-title">
              <span>Title</span>
              <Input
                disabled={isSubmitting}
                id="create-task-title"
                onChange={(event) => setTitle(event.currentTarget.value)}
                placeholder="Summarize the task"
                type="text"
                value={title}
              />
            </Label>
            <Label htmlFor="create-task-spec">
              <span>Task Spec</span>
              <Textarea
                disabled={isSubmitting}
                id="create-task-spec"
                onChange={(event) => setTaskSpec(event.currentTarget.value)}
                placeholder="Describe the task to create"
                value={taskSpec}
              />
            </Label>
          </LyraStack>
        </LyraPanel>

        <aside className="aim-task-form-sidebar">
          <LyraStack>
            <div>
              <LyraKicker>Workspace Target</LyraKicker>
              <h3>Project Path</h3>
            </div>
            <Label htmlFor="create-task-project-path">
              <span>Project Path</span>
              <Input
                disabled={isSubmitting}
                id="create-task-project-path"
                onChange={(event) => setProjectPath(event.currentTarget.value)}
                placeholder="/absolute/path/to/repo"
                type="text"
                value={projectPath}
              />
            </Label>

            <Label htmlFor="create-task-developer-model">
              <span>Developer Model</span>
              <Select
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
              </Select>
            </Label>

            <LyraStack>
              <div>
                <LyraKicker>Submission Checklist</LyraKicker>
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
            </LyraStack>
          </LyraStack>
        </aside>
      </div>

      <div className="aim-task-form-footer">
        <LyraMuted>
          The create flow keeps the existing API contract and trims accidental
          whitespace before submit.
        </LyraMuted>
        <div className="aim-task-actions">
          <Button disabled={isSubmitting} onClick={onCancel} variant="outline">
            Cancel
          </Button>
          <Button disabled={!canSubmit || isSubmitting} type="submit">
            {isSubmitting ? "Creating Task..." : "Create Task"}
          </Button>
        </div>
      </div>
    </LyraSurface>
  );
};
