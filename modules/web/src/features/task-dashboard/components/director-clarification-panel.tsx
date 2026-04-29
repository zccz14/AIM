import type {
  DirectorClarification,
  DirectorClarificationKind,
  DirectorClarificationStatus,
} from "@aim-ai/contract";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "../../../components/ui/alert.js";
import { Badge } from "../../../components/ui/badge.js";
import { Button } from "../../../components/ui/button.js";
import { Card, CardContent } from "../../../components/ui/card.js";
import { Label } from "../../../components/ui/label.js";
import { Textarea } from "../../../components/ui/textarea.js";
import { useI18n } from "../../../lib/i18n.js";
import {
  createDirectorClarification,
  patchDirectorClarificationStatus,
} from "../api/task-dashboard-api.js";
import {
  directorClarificationsQueryKey,
  directorClarificationsQueryOptions,
  getDirectorClarificationErrorMessage,
} from "../queries.js";
import {
  eyebrow,
  panelStack,
  sectionCopy,
  sectionTitle,
  tableMeta,
} from "./dashboard-styles.js";

const formatDateLabel = (value: string) => value.slice(0, 16).replace("T", " ");

const sortRecentClarifications = (clarifications: DirectorClarification[]) =>
  [...clarifications].sort((left, right) =>
    right.created_at.localeCompare(left.created_at),
  );

export const DirectorClarificationPanel = ({
  contextName,
  dimensionId = null,
  projectId,
}: {
  contextName: string;
  dimensionId?: string | null;
  projectId: string;
}) => {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<DirectorClarificationKind>("clarification");
  const [message, setMessage] = useState("");
  const clarificationsQuery = useQuery(
    directorClarificationsQueryOptions(projectId, dimensionId),
  );
  const createMutation = useMutation({
    mutationFn: () =>
      createDirectorClarification(projectId, {
        project_id: projectId,
        dimension_id: dimensionId,
        kind,
        message,
      }),
    onSuccess: async () => {
      setMessage("");
      await queryClient.invalidateQueries({
        queryKey: directorClarificationsQueryKey(projectId, dimensionId),
      });
    },
  });
  const statusMutation = useMutation({
    mutationFn: ({
      clarificationId,
      status,
    }: {
      clarificationId: string;
      status: DirectorClarificationStatus;
    }) => patchDirectorClarificationStatus(projectId, clarificationId, status),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: directorClarificationsQueryKey(projectId, dimensionId),
      });
    },
  });
  const recentClarifications = sortRecentClarifications(
    clarificationsQuery.data?.items ?? [],
  ).slice(0, 5);
  const trimmedMessage = message.trim();
  const isSubmitDisabled =
    trimmedMessage.length === 0 || createMutation.isPending;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitDisabled) {
      return;
    }

    createMutation.mutate();
  };

  const handleStatusChange = (
    clarificationId: string,
    status: DirectorClarificationStatus,
  ) => {
    statusMutation.mutate({ clarificationId, status });
  };

  return (
    <section
      aria-label={t("directorClarificationRegion")}
      className="grid gap-3 border bg-card p-4 shadow-sm"
    >
      <div className="grid gap-1">
        <p className={eyebrow}>{t("directorClarificationEyebrow")}</p>
        <h2 className={sectionTitle}>{t("directorClarificationTitle")}</h2>
        <p className={sectionCopy}>{t("directorClarificationDescription")}</p>
      </div>

      <form className="grid gap-3" onSubmit={handleSubmit}>
        <div className="grid gap-3 md:grid-cols-[minmax(10rem,0.35fr)_minmax(0,1fr)]">
          <div className={panelStack}>
            <Label htmlFor="director-clarification-kind">
              {t("directorClarificationKind")}
            </Label>
            <select
              className="h-10 rounded-md border bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              id="director-clarification-kind"
              onChange={(event) =>
                setKind(event.target.value as DirectorClarificationKind)
              }
              value={kind}
            >
              <option value="clarification">
                {t("directorClarificationKindClarification")}
              </option>
              <option value="adjustment">
                {t("directorClarificationKindAdjustment")}
              </option>
            </select>
          </div>
          <div className={panelStack}>
            <Label htmlFor="director-clarification-message">
              {t("directorClarificationMessage")}
            </Label>
            <Textarea
              id="director-clarification-message"
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t("directorClarificationPlaceholder")}
              value={message}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className={tableMeta}>
            {t("directorClarificationContext")}: {contextName}.{" "}
            {t("directorClarificationGuardrail")}
          </p>
          <Button disabled={isSubmitDisabled} type="submit">
            {createMutation.isPending ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {createMutation.isPending
              ? t("directorClarificationSubmitting")
              : t("directorClarificationSubmit")}
          </Button>
        </div>
      </form>

      {createMutation.isSuccess ? (
        <Alert>
          <AlertTitle>{t("directorClarificationSubmitted")}</AlertTitle>
          <AlertDescription>
            {t("directorClarificationSubmittedDescription")}
          </AlertDescription>
        </Alert>
      ) : null}

      {createMutation.isError ? (
        <Alert variant="destructive">
          <AlertCircle aria-hidden="true" />
          <AlertTitle>{t("directorClarificationFailed")}</AlertTitle>
          <AlertDescription>
            {getDirectorClarificationErrorMessage(createMutation.error)}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card className="bg-muted/35 shadow-none">
        <CardContent className="grid gap-3 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={eyebrow}>{t("directorClarificationRecent")}</p>
            {clarificationsQuery.isFetching ? (
              <Badge variant="outline">{t("loadingConvergenceEvidence")}</Badge>
            ) : null}
          </div>

          {clarificationsQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{t("directorClarificationRecentFailed")}</AlertTitle>
              <AlertDescription>
                {getDirectorClarificationErrorMessage(
                  clarificationsQuery.error,
                )}
              </AlertDescription>
            </Alert>
          ) : null}

          {statusMutation.isError ? (
            <Alert variant="destructive">
              <AlertCircle aria-hidden="true" />
              <AlertTitle>{t("directorClarificationStatusFailed")}</AlertTitle>
              <AlertDescription>
                {getDirectorClarificationErrorMessage(statusMutation.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          {recentClarifications.length === 0 &&
          clarificationsQuery.isSuccess ? (
            <p className={sectionCopy}>{t("directorClarificationEmpty")}</p>
          ) : null}

          {recentClarifications.map((clarification) => (
            <div
              className="grid gap-2 border-t pt-3 first:border-t-0 first:pt-0"
              key={clarification.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">
                    {clarification.kind === "adjustment"
                      ? t("directorClarificationKindAdjustment")
                      : t("directorClarificationKindClarification")}
                  </Badge>
                  <Badge
                    variant={
                      clarification.status === "open" ? "default" : "secondary"
                    }
                  >
                    {clarification.status}
                  </Badge>
                  <span className={tableMeta}>
                    {formatDateLabel(clarification.created_at)}
                  </span>
                </div>
                <Button
                  disabled={
                    statusMutation.isPending &&
                    statusMutation.variables?.clarificationId ===
                      clarification.id
                  }
                  onClick={() =>
                    handleStatusChange(
                      clarification.id,
                      clarification.status === "open" ? "addressed" : "open",
                    )
                  }
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {statusMutation.isPending &&
                  statusMutation.variables?.clarificationId ===
                    clarification.id ? (
                    <LoaderCircle
                      className="animate-spin"
                      data-icon="inline-start"
                    />
                  ) : null}
                  {clarification.status === "open"
                    ? t("directorClarificationMarkResolved")
                    : t("directorClarificationReopen")}
                </Button>
              </div>
              <p className="m-0 text-sm/relaxed">{clarification.message}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </section>
  );
};
