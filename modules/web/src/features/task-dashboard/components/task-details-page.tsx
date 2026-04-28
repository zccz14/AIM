import { Card } from "../../../components/ui/card.js";
import { useI18n } from "../../../lib/i18n.js";
import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import {
  Checkmark,
  Chip,
  chipList,
  DetailCard,
  detailHeader,
  detailPanelHeader,
  detailSummary,
  detailSurface,
  detailTitle,
  detailTitleRow,
  Kicker,
  MarkdownContent,
  Muted,
  metadataLabel,
  metadataList,
  metadataRow,
  mutedText,
  pageStack,
  responsiveDetailGrid,
  sectionStack,
} from "./dashboard-styles.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const TaskDetailsPage = ({ task }: { task: DashboardTask | null }) => {
  const { t } = useI18n();

  if (!task) {
    return (
      <Card className={detailSurface}>
        <Kicker>{t("taskDetails")}</Kicker>
        <h2>{t("taskNotFound")}</h2>
        <Muted>{t("taskNotFoundDescription")}</Muted>
      </Card>
    );
  }

  const metadataRows = [
    { label: t("projectId"), value: task.projectId },
    { label: t("taskId"), value: task.id },
    { label: t("contractStatus"), value: task.contractStatus },
    { label: t("dashboardStatus"), value: task.dashboardStatus },
    {
      label: t("sourceBaseline"),
      value: task.sourceBaselineFreshness.status,
    },
    {
      label: t("sourceCommit"),
      value: task.sourceBaselineFreshness.sourceCommit ?? t("none"),
    },
    {
      label: t("currentCommit"),
      value: task.sourceBaselineFreshness.currentCommit ?? t("none"),
    },
    { label: t("sessionId"), value: task.sessionId ?? t("none") },
    { label: t("worktree"), value: task.worktreePath ?? t("none") },
    { label: t("createdAt"), value: task.createdAt },
    { label: t("updatedAt"), value: task.updatedAt },
  ];

  return (
    <Card className={detailSurface}>
      <header className={detailHeader}>
        <div className={detailTitleRow}>
          <div className={sectionStack}>
            <Kicker>{t("taskOverview")}</Kicker>
            <h2 className={detailTitle}>{task.title}</h2>
          </div>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <Muted className={detailSummary}>{t("taskOverviewDescription")}</Muted>
      </header>

      <div className={responsiveDetailGrid}>
        <DetailCard>
          <div className={detailPanelHeader}>
            <Kicker>{t("taskSpec")}</Kicker>
            <h3>{task.title}</h3>
          </div>
          <MarkdownContent>{task.taskSpec}</MarkdownContent>
        </DetailCard>

        <div className={pageStack}>
          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>{t("executionMetadata")}</Kicker>
              <h3>{t("deliveryContext")}</h3>
            </div>
            <dl className={metadataList}>
              {metadataRows.map((row) => (
                <div className={metadataRow} key={row.label}>
                  <dt className={metadataLabel}>{row.label}</dt>
                  <dd className="m-0">{`${row.label}: ${row.value}`}</dd>
                </div>
              ))}
            </dl>
            <Muted>{task.sourceBaselineFreshness.summary}</Muted>
          </DetailCard>

          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>{t("developerClosureCues")}</Kicker>
              <h3>{t("checklistFacts")}</h3>
            </div>
            <div className="flex flex-col gap-3">
              {task.closureChecklist.map((cue) => (
                <div className="flex items-start gap-3" key={cue.key}>
                  <Checkmark>{cue.isComplete ? "OK" : "!"}</Checkmark>
                  <div>
                    <strong>{`${cue.label}: ${cue.statusLabel}`}</strong>
                    <Muted>{cue.detail}</Muted>
                  </div>
                </div>
              ))}
            </div>
          </DetailCard>

          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>{t("taskRelationships")}</Kicker>
              <h3>{t("tableDependencies")} / PR</h3>
            </div>
            <div className={chipList}>
              {task.dependencies.length > 0 ? (
                task.dependencies.map((dependencyId) => (
                  <Chip key={dependencyId}>{dependencyId}</Chip>
                ))
              ) : (
                <span className={mutedText}>{t("dependenciesNone")}</span>
              )}
            </div>
            {task.pullRequestUrl ? (
              <a
                className="text-primary underline underline-offset-4"
                href={task.pullRequestUrl}
                rel="noreferrer"
                target="_blank"
              >
                {t("openPullRequest")}
              </a>
            ) : (
              <span className={mutedText}>{t("pullRequestNone")}</span>
            )}
          </DetailCard>
        </div>
      </div>
    </Card>
  );
};
