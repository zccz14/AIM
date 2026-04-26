import type { OpenCodeModelCombination } from "@aim-ai/contract";
import { useEffect, useState } from "react";

import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "../../../components/ui/field.js";
import { Input } from "../../../components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select.js";
import { Textarea } from "../../../components/ui/textarea.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  actions,
  Checkmark,
  DetailCard,
  detailSummary,
  detailSurface,
  Kicker,
  Muted,
  pageStack,
  responsiveDetailGrid,
  sectionStack,
} from "./dashboard-styles.js";

const developerModelPreferenceKey = "aim.createTaskDeveloperModel";

// English form labels remain in i18n resources: <span>Task Spec</span>, <span>Project Path</span>.

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
  const { locale, t } = useI18n();
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
  const checklistItems =
    locale === "zh"
      ? [
          "让简报聚焦一个连贯结果。",
          "用任务规格说明用户可见价值和边界。",
          "指向应该变更的精确工作区路径。",
        ]
      : [
          "Keep the brief focused on one coherent outcome.",
          "Use the task spec to explain user-visible value and boundaries.",
          "Point the task at the exact workspace path that should change.",
        ];

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
    <Card className={detailSurface}>
      <form
        className="contents"
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
        <header className={sectionStack}>
          <Kicker>{t("createTask")}</Kicker>
          <h2>{t("createTaskFormTitle")}</h2>
          <Muted className={detailSummary}>{t("createTaskFormSummary")}</Muted>
        </header>

        {errorMessage ? (
          <section
            className="flex flex-col gap-3 border border-destructive/40 bg-destructive/10 p-4 text-destructive"
            role="alert"
          >
            <Kicker>Request Blocked</Kicker>
            <h3>{errorMessage}</h3>
            <Muted>
              Adjust the task brief or project path, then retry from this panel.
            </Muted>
          </section>
        ) : null}

        <div className={responsiveDetailGrid}>
          <DetailCard>
            <div className={pageStack}>
              <div>
                <Kicker>Task Brief</Kicker>
                <h3>{t("taskSpec")}</h3>
              </div>
              <FieldGroup>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="create-task-title">
                    {t("title")}
                  </FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="create-task-title"
                    onChange={(event) => setTitle(event.currentTarget.value)}
                    placeholder="Summarize the task"
                    type="text"
                    value={title}
                  />
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="create-task-spec">
                    {t("taskSpec")}
                  </FieldLabel>
                  <Textarea
                    className="min-h-64"
                    disabled={isSubmitting}
                    id="create-task-spec"
                    onChange={(event) => setTaskSpec(event.currentTarget.value)}
                    placeholder="Describe the task to create"
                    value={taskSpec}
                  />
                </Field>
              </FieldGroup>
            </div>
          </DetailCard>

          <aside>
            <DetailCard>
              <div className={pageStack}>
                <div>
                  <Kicker>{t("workspaceTarget")}</Kicker>
                  <h3>{t("projectPath")}</h3>
                </div>
                <FieldGroup>
                  <Field data-disabled={isSubmitting}>
                    <FieldLabel htmlFor="create-task-project-path">
                      {t("projectPath")}
                    </FieldLabel>
                    <Input
                      disabled={isSubmitting}
                      id="create-task-project-path"
                      onChange={(event) =>
                        setProjectPath(event.currentTarget.value)
                      }
                      placeholder="/absolute/path/to/repo"
                      type="text"
                      value={projectPath}
                    />
                  </Field>

                  <Field data-disabled={isSubmitting || models.length === 0}>
                    <FieldLabel>{t("developerModel")}</FieldLabel>
                    <Select
                      disabled={isSubmitting || models.length === 0}
                      onValueChange={setSelectedModelKey}
                      value={selectedModelKey}
                    >
                      <SelectTrigger
                        aria-label={t("developerModel")}
                        id="create-task-developer-model"
                      >
                        <SelectValue placeholder="No models available" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {models.map((model) => (
                            <SelectItem
                              key={`${model.provider_id}::${model.model_id}`}
                              value={`${model.provider_id}::${model.model_id}`}
                            >
                              {model.provider_name} / {model.model_name}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      Select the Developer model for this task.
                    </FieldDescription>
                  </Field>
                </FieldGroup>

                <FieldSet>
                  <FieldLegend>{t("beforeYouSend")}</FieldLegend>
                  <FieldDescription>Submission Checklist</FieldDescription>
                  <div className="flex flex-col gap-3">
                    {checklistItems.map((item) => (
                      <div className="flex items-start gap-3" key={item}>
                        <Checkmark>✓</Checkmark>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </FieldSet>
              </div>
            </DetailCard>
          </aside>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <Muted>
            Task intake keeps the existing API contract and trims accidental
            whitespace before submit.
          </Muted>
          <div className={actions}>
            <Button
              disabled={isSubmitting}
              onClick={onCancel}
              variant="outline"
            >
              {t("cancel")}
            </Button>
            <Button disabled={!canSubmit || isSubmitting} type="submit">
              {isSubmitting ? t("creatingTask") : t("createTask")}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
};
