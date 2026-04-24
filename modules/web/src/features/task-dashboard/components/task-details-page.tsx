import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import type { DashboardTask } from "../model/task-dashboard-view-model.js";
import { TaskStatusBadge } from "./task-status-badge.js";

export const TaskDetailsPage = ({ task }: { task: DashboardTask | null }) => {
  if (!task) {
    return (
      <section className="surface-card section-stack">
        <h2 className="section-title">Task not found</h2>
        <p className="muted-text">
          The requested task is not available from the current dashboard data.
        </p>
      </section>
    );
  }

  return (
    <section className="surface-card details-stack">
      <div className="details-grid">
        <div className="detail-item details-stack">
          <p className="eyebrow">Task Details</p>
          <h2 className="section-title">{task.title}</h2>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <div className="detail-item details-stack">
          <p className="detail-value">Project Path: {task.projectPath}</p>
          <p className="detail-value">Task ID: {task.id}</p>
        </div>
      </div>
      <div className="markdown-stack">
        <p className="detail-label">Task Spec</p>
        <div className="markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {task.taskSpec}
          </ReactMarkdown>
        </div>
      </div>
      <div className="details-grid">
        <div className="detail-item details-stack">
          <p className="detail-value">Contract Status: {task.contractStatus}</p>
          <p className="detail-label">Dashboard Status</p>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <div className="detail-item details-stack">
          <p className="detail-value">Session ID: {task.sessionId ?? "None"}</p>
          <p className="detail-value">
            Worktree: {task.worktreePath ?? "None"}
          </p>
        </div>
        <div className="detail-item details-stack">
          <p className="detail-value">
            Dependencies:{" "}
            {task.dependencies.length > 0
              ? task.dependencies.join(", ")
              : "None"}
          </p>
          <p className="detail-value">Created At: {task.createdAt}</p>
        </div>
        <div className="detail-item details-stack">
          <p className="detail-value">Updated At: {task.updatedAt}</p>
          {task.pullRequestUrl ? (
            <a
              className="interactive-link interactive-link--subtle"
              href={task.pullRequestUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open PR
            </a>
          ) : null}
        </div>
      </div>
    </section>
  );
};
