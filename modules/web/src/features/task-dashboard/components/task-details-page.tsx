import { Card } from "../../../components/ui/card.js";
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

const metadataRows = (task: DashboardTask) => [
  { label: "Project ID", value: task.projectId },
  { label: "Task ID", value: task.id },
  { label: "Contract Status", value: task.contractStatus },
  { label: "Dashboard Status", value: task.dashboardStatus },
  { label: "Session ID", value: task.sessionId ?? "None" },
  { label: "Worktree", value: task.worktreePath ?? "None" },
  { label: "Created At", value: task.createdAt },
  { label: "Updated At", value: task.updatedAt },
];

export const TaskDetailsPage = ({ task }: { task: DashboardTask | null }) => {
  if (!task) {
    return (
      <Card className={detailSurface}>
        <Kicker>Task Details</Kicker>
        <h2>Task not found</h2>
        <Muted>
          The requested task is not available from the current dashboard data.
        </Muted>
      </Card>
    );
  }

  return (
    <Card className={detailSurface}>
      <header className={detailHeader}>
        <div className={detailTitleRow}>
          <div className={sectionStack}>
            <Kicker>Task Overview</Kicker>
            <h2 className={detailTitle}>{task.title}</h2>
          </div>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <Muted className={detailSummary}>
          Review the task brief, delivery metadata, dependencies, and closure
          cues without dropping out of the Director cockpit.
        </Muted>
      </header>

      <div className={responsiveDetailGrid}>
        <DetailCard>
          <div className={detailPanelHeader}>
            <Kicker>Task Spec</Kicker>
            <h3>{task.title}</h3>
          </div>
          <MarkdownContent>{task.taskSpec}</MarkdownContent>
        </DetailCard>

        <div className={pageStack}>
          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>Execution Metadata</Kicker>
              <h3>Delivery Context</h3>
            </div>
            <dl className={metadataList}>
              {metadataRows(task).map((row) => (
                <div className={metadataRow} key={row.label}>
                  <dt className={metadataLabel}>{row.label}</dt>
                  <dd className="m-0">{`${row.label}: ${row.value}`}</dd>
                </div>
              ))}
            </dl>
          </DetailCard>

          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>Developer Closure Cues</Kicker>
              <h3>Checklist Facts</h3>
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
              <Kicker>Task Relationships</Kicker>
              <h3>Dependencies and PR</h3>
            </div>
            <div className={chipList}>
              {task.dependencies.length > 0 ? (
                task.dependencies.map((dependencyId) => (
                  <Chip key={dependencyId}>{dependencyId}</Chip>
                ))
              ) : (
                <span className={mutedText}>Dependencies: None</span>
              )}
            </div>
            {task.pullRequestUrl ? (
              <a
                className="text-primary underline underline-offset-4"
                href={task.pullRequestUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open Pull Request
              </a>
            ) : (
              <span className={mutedText}>Pull Request: None</span>
            )}
          </DetailCard>
        </div>
      </div>
    </Card>
  );
};
