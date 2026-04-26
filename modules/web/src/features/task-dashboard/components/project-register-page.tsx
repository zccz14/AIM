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
  projectPath: "",
};

const toFormInput = (project: Project): ProjectFormInput => ({
  globalModelId: project.global_model_id,
  globalProviderId: project.global_provider_id,
  name: project.name,
  projectPath: project.project_path,
});

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Project request failed";

export const ProjectRegisterPage = () => {
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
    projectPath: form.projectPath.trim(),
  };
  const canSubmit = Object.values(trimmedForm).every(Boolean);
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
          setErrorMessage(getErrorMessage(error));
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
  }, []);

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
      setErrorMessage(getErrorMessage(error));
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
      setErrorMessage(getErrorMessage(error));
    }
  };

  return (
    <section className={pageStack}>
      <p className={sectionCopy}>
        Project CRUD keeps task intake anchored to explicit repositories and
        global model defaults before autonomous work starts.
      </p>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTitle>Project request blocked</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <Card className={detailSurface}>
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>
              Review known workspaces, paths, and global Developer model
              routing.
            </CardDescription>
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
                  <EmptyTitle>No Projects Yet</EmptyTitle>
                  <EmptyDescription>
                    Create the first project so tasks can use a stable path and
                    global model configuration.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Project</th>
                      <th className="py-2 pr-3 font-medium">Path</th>
                      <th className="py-2 pr-3 font-medium">Global Model</th>
                      <th className="py-2 pr-0 text-right font-medium">
                        Actions
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
                        <td className="py-3 pr-3">{project.project_path}</td>
                        <td className="py-3 pr-3">
                          <Badge variant="secondary">
                            {project.global_provider_id} /{" "}
                            {project.global_model_id}
                          </Badge>
                        </td>
                        <td className="py-3 pr-0">
                          <div className="flex justify-end gap-2">
                            <Button
                              aria-label={`Edit ${project.name}`}
                              onClick={() => {
                                setEditingProjectId(project.id);
                                setForm(toFormInput(project));
                              }}
                              size="sm"
                              variant="outline"
                            >
                              <Pencil data-icon="inline-start" />
                              Edit
                            </Button>
                            <Button
                              aria-label={`Delete ${project.name}`}
                              onClick={() => void handleDelete(project)}
                              size="sm"
                              variant="outline"
                            >
                              <Trash2 data-icon="inline-start" />
                              Delete
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
                  {editingProject ? "Edit Project" : "Create Project"}
                </CardTitle>
                <CardDescription>
                  Store the project path and global model pair used by task
                  creation.
                </CardDescription>
                {editingProject ? (
                  <CardAction>
                    <Badge variant="outline">Editing</Badge>
                  </CardAction>
                ) : null}
              </CardHeader>

              <FieldGroup>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="project-name">Project Name</FieldLabel>
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
                  <FieldLabel htmlFor="project-path">Project Path</FieldLabel>
                  <Input
                    disabled={isSubmitting}
                    id="project-path"
                    onChange={(event) => {
                      const { value } = event.currentTarget;

                      setForm((currentForm) => ({
                        ...currentForm,
                        projectPath: value,
                      }));
                    }}
                    value={form.projectPath}
                  />
                  <FieldDescription>
                    Use the absolute repository path that AIM should operate on.
                  </FieldDescription>
                </Field>
                <Field data-disabled={isSubmitting}>
                  <FieldLabel htmlFor="global-provider">
                    Global Provider
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
                  <FieldLabel htmlFor="global-model">Global Model</FieldLabel>
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
              </FieldGroup>

              <CardFooter className="px-0 pb-0">
                <div className="flex w-full flex-wrap items-start justify-between gap-3">
                  <Muted>
                    Project changes update the register, not existing task
                    history.
                  </Muted>
                  <div className={actions}>
                    {editingProject ? (
                      <Button
                        disabled={isSubmitting}
                        onClick={resetForm}
                        type="button"
                        variant="outline"
                      >
                        Cancel
                      </Button>
                    ) : null}
                    <Button disabled={!canSubmit || isSubmitting} type="submit">
                      {isSubmitting ? (
                        <LoaderCircle data-icon="inline-start" />
                      ) : null}
                      {editingProject ? "Save Project" : "Create Project"}
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
