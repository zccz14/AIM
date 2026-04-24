import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

const metadataRows = (task: DashboardTask) => [
  { label: "Project Path", value: task.projectPath },
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
      <section className="aim-empty-state aim-surface aim-task-details">
        <p className="aim-kicker">Task Details</p>
        <h2>Task not found</h2>
        <p className="aim-muted">
          The requested task is not available from the current dashboard data.
        </p>
      </section>
    );
  }

  return (
    <section className="aim-surface aim-task-details aim-stack">
      <header className="aim-task-details-header">
        <div className="aim-task-title-row">
          <div className="aim-stack">
            <p className="aim-kicker">Task Overview</p>
            <h2 className="aim-task-title">{task.title}</h2>
          </div>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <p className="aim-task-summary aim-muted">
          Review the task brief, delivery metadata, and outbound context without
          losing the dark-theme reading rhythm established on the dashboard.
        </p>
      </header>

      <div className="aim-task-grid">
        <section className="aim-task-panel">
          <div className="aim-task-panel-header">
            <p className="aim-kicker">Task Spec</p>
            <h3>{task.title}</h3>
          </div>
          <div className="aim-task-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.taskSpec}
            </ReactMarkdown>
          </div>
        </section>

        <div className="aim-stack">
          <section className="aim-task-panel">
            <div className="aim-task-panel-header">
              <p className="aim-kicker">Execution Metadata</p>
              <h3>Delivery Context</h3>
            </div>
            <dl className="aim-task-metadata">
              {metadataRows(task).map((row) => (
                <div className="aim-task-meta-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{`${row.label}: ${row.value}`}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="aim-task-panel">
            <div className="aim-task-panel-header">
              <p className="aim-kicker">Task Relationships</p>
              <h3>Dependencies and PR</h3>
            </div>
            <div className="aim-task-chip-list">
              {task.dependencies.length > 0 ? (
                task.dependencies.map((dependencyId) => (
                  <span className="aim-task-chip" key={dependencyId}>
                    {dependencyId}
                  </span>
                ))
              ) : (
                <span className="aim-muted">Dependencies: None</span>
              )}
            </div>
            {task.pullRequestUrl ? (
              <a
                className="aim-task-link"
                href={task.pullRequestUrl}
                rel="noreferrer"
                target="_blank"
              >
                Open Pull Request
              </a>
            ) : (
              <span className="aim-muted">Pull Request: None</span>
            )}
          </section>
        </div>
      </div>
    </section>
  );
};
