import type { Project } from "@aim-ai/contract";
import { LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.js";
import { Badge } from "../../../components/ui/badge.js";
import { Button } from "../../../components/ui/button.js";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../../../components/ui/card.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "../../../components/ui/field.js";
import { Input } from "../../../components/ui/input.js";
import { Skeleton } from "../../../components/ui/skeleton.js";
import { Switch } from "../../../components/ui/switch.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  createProject,
  deleteProject,
  listProjects,
  type ProjectFormInput,
  updateProject,
} from "../api/task-dashboard-api.js";
import {
  actions,
  DetailCard,
  detailSurface,
  Muted,
  pageStack,
  sectionCopy,
  sectionStack,
} from "./dashboard-styles.js";

const emptyForm = {
  globalModelId: "",
  globalProviderId: "",
  name: "",
  gitOriginUrl: "",
  optimizerEnabled: false,
};

const toFormInput = (project: Project): ProjectFormInput => ({
  globalModelId: project.global_model_id,
  globalProviderId: project.global_provider_id,
  name: project.name,
  gitOriginUrl: project.git_origin_url,
  optimizerEnabled: project.optimizer_enabled,
});

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback;

export const ProjectRegisterPage = () => {
  const { t } = useI18n();
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState<ProjectFormInput>(emptyForm);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const trimmedForm = {
    globalModelId: form.globalModelId.trim(),
    globalProviderId: form.globalProviderId.trim(),
    name: form.name.trim(),
    gitOriginUrl: form.gitOriginUrl.trim(),
    optimizerEnabled: form.optimizerEnabled,
  };
  const canSubmit = [
    trimmedForm.globalModelId,
    trimmedForm.globalProviderId,
    trimmedForm.name,
    trimmedForm.gitOriginUrl,
  ].every(Boolean);
  const editingProject = projects.find(
    (project) => project.id === editingProjectId,
  );

  useEffect(() => {
    let isActive = true;

    void listProjects()
      .then((response) => {
        if (isActive) {
          setProjects(response.items);
          setErrorMessage(null);
        }
      })
      .catch((error: unknown) => {
        if (isActive) {
          setErrorMessage(getErrorMessage(error, t("projectRequestFailed")));
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [t]);

  const resetForm = () => {
    setEditingProjectId(null);
    setForm(emptyForm);
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const savedProject = editingProjectId
        ? await updateProject(editingProjectId, trimmedForm)
        : await createProject(trimmedForm);

      setProjects((currentProjects) => {
        if (!editingProjectId) {
          return [...currentProjects, savedProject];
        }

        return currentProjects.map((project) =>
          project.id === savedProject.id ? savedProject : project,
        );
      });
      resetForm();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t("projectRequestFailed")));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (project: Project) => {
    setErrorMessage(null);

    try {
      await deleteProject(project.id);
      setProjects((currentProjects) =>
        currentProjects.filter(
          (currentProject) => currentProject.id !== project.id,
        ),
      );

      if (editingProjectId === project.id) {
        resetForm();
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t("projectRequestFailed")));
    }
  };

  return (
    <section className={pageStack}>
      <p className={sectionCopy}>{t("projectCrudDescription")}</p>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>{t("projectRequestBlocked")}</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className={detailSurface}>
          <CardHeader>
            <CardTitle>{t("projects")}</CardTitle>
            <CardDescription>{t("projectHealthDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : projects.length === 0 ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyTitle>{t("noProjectsYet")}</EmptyTitle>
                  <EmptyDescription>
                    {t("noProjectsYetDescription")}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">
                        {t("projectSingular")}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t("gitOriginUrl")}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t("globalModel")}
                      </th>
                      <th className="py-2 pr-3 font-medium">
                        {t("optimizer")}
                      </th>
                      <th className="py-2 pr-0 text-right font-medium">
                        {t("globalControls")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr className="border-b last:border-b-0" key={project.id}>
                        <td className="py-3 pr-3">
                          <div className="flex flex-col gap-1">
                            <span className="font-medium">{project.name}</span>
                            <span className="text-muted-foreground">
                              {project.id}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 pr-3">{project.git_origin_url}</td>
                        <td className="py-3 pr-3">
                          <Badge variant="secondary">
                            {project.global_provider_id} /{" "}
                            {project.global_model_id}
                          </Badge>
                        </td>
                        <td className="py-3 pr-3">
                          <Badge
                            variant={
                              project.optimizer_enabled ? "default" : "outline"
                            }
                          >
                            {project.optimizer_enabled
                              ? t("enabled")
                              : t("disabled")}
                          </Badge>
                        </td>
                        <td className="py-3 pr-0">
                          <div className="flex justify-end gap-2">
                            <Button asChild size="sm" variant="outline">
                              <a
                                href={`#/projects/${encodeURIComponent(project.id)}`}
                              >
                                {t("open")}
                                <span className="sr-only"> {project.name}</span>
                              </a>
                            </Button>
                            <Button
                              aria-label={`${t("edit")} ${project.name}`}
                              onClick={() => {
                                setEditingProjectId(project.id);
                                setForm(toFormInput(project));
                              }}
                              size="sm"
                              variant="outline"
                            >
                              <Pencil data-icon="inline-start" />
                              {t("edit")}
                            </Button>
                            <Button
                              aria-label={`${t("delete")} ${project.name}`}
                              onClick={() => void handleDelete(project)}
                              size="sm"
                              variant="outline"
                            >
                              <Trash2 data-icon="inline-start" />
                              {t("delete")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <aside>
          <DetailCard>
            <form
              className={sectionStack}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <CardHeader className="px-0">
                <CardTitle>
                  {editingProject ? t("editProject") : t("createProject")}
                </CardTitle>
                <CardDescription>
                  {t("noProjectsYetDescription")}
                </CardDescription>
                {editingProject ? (
                  <CardAction>
                    <Badge variant="outline">{t("editing")}</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>

              <FieldGroup>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="project-name">
                    {t("projectName")}
                  </FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="project-name"
                    onChange={(event) => {
                      const { value } = event.currentTarget;

                      setForm((currentForm) => ({
                        ...currentForm,
                        name: value,
                      }));
                    }}
                    value={form.name}
                  />
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="git-origin-url">
                    {t("gitOriginUrl")}
                  </FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="git-origin-url"
                    onChange={(event) => {
                      const { value } = event.currentTarget;

                      setForm((currentForm) => ({
                        ...currentForm,
                        gitOriginUrl: value,
                      }));
                    }}
                    value={form.gitOriginUrl}
                  />
                  <FieldDescription>
                    {t("useGitOriginUrlDescription")}
                  </FieldDescription>
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="global-provider">
                    {t("globalProvider")}
                  </FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="global-provider"
                    onChange={(event) => {
                      const { value } = event.currentTarget;

                      setForm((currentForm) => ({
                        ...currentForm,
                        globalProviderId: value,
                      }));
                    }}
                    value={form.globalProviderId}
                  />
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="global-model">
                    {t("globalModel")}
                  </FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="global-model"
                    onChange={(event) => {
                      const { value } = event.currentTarget;

                      setForm((currentForm) => ({
                        ...currentForm,
                        globalModelId: value,
                      }));
                    }}
                    value={form.globalModelId}
                  />
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="optimizer-enabled">
                    {t("projectOptimizer")}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={form.optimizerEnabled}
                      disabled={isSubmitting}
                      id="optimizer-enabled"
                      onCheckedChange={(checked) => {
                        setForm((currentForm) => ({
                          ...currentForm,
                          optimizerEnabled: checked,
                        }));
                      }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {form.optimizerEnabled ? t("enabled") : t("disabled")}
                    </span>
                  </div>
                  <FieldDescription>
                    {t("projectOptimizerDescription")}
                  </FieldDescription>
                </Field>
              </FieldGroup>

              <CardFooter className="px-0 pb-0">
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <Muted>{t("projectChangesDescription")}</Muted>
                  <div className={actions}>
                    {editingProject ? (
                      <Button
                        disabled={isSubmitting}
                        onClick={resetForm}
                        type="button"
                        variant="outline"
                      >
                        {t("cancel")}
                      </Button>
                    ) : null}
                    <Button disabled={!canSubmit || isSubmitting} type="submit">
                      {isSubmitting ? (
                        <LoaderCircle data-icon="inline-start" />
                      ) : null}
                      {editingProject ? t("saveProject") : t("createProject")}
                    </Button>
                  </div>
                </div>
              </CardFooter>
            </form>
          </DetailCard>
        </aside>
      </div>
    </section>
  );
};
