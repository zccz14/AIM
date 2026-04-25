import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  LyraKicker,
  LyraMuted,
  LyraPanel,
  LyraStack,
  LyraSurface,
} from "../../../components/ui/lyra-surface.js";
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
      <LyraSurface className="aim-empty-state aim-task-details">
        <LyraKicker>Task Details</LyraKicker>
        <h2>Task not found</h2>
        <LyraMuted>
          The requested task is not available from the current dashboard data.
        </LyraMuted>
      </LyraSurface>
    );
  }

  return (
    <LyraSurface className="aim-task-details aim-stack">
      <header className="aim-task-details-header">
        <div className="aim-task-title-row">
          <LyraStack>
            <LyraKicker>Task Overview</LyraKicker>
            <h2 className="aim-task-title">{task.title}</h2>
          </LyraStack>
          <TaskStatusBadge status={task.dashboardStatus} />
        </div>
        <LyraMuted className="aim-task-summary">
          Review the task brief, delivery metadata, and outbound context without
          losing the dark-theme reading rhythm established on the dashboard.
        </LyraMuted>
      </header>

      <div className="aim-task-grid">
        <LyraPanel>
          <div className="aim-task-panel-header">
            <LyraKicker>Task Spec</LyraKicker>
            <h3>{task.title}</h3>
          </div>
          <div className="aim-task-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.taskSpec}
            </ReactMarkdown>
          </div>
        </LyraPanel>

        <LyraStack>
          <LyraPanel>
            <div className="aim-task-panel-header">
              <LyraKicker>Execution Metadata</LyraKicker>
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
          </LyraPanel>

          <LyraPanel>
            <div className="aim-task-panel-header">
              <LyraKicker>Developer Closure Cues</LyraKicker>
              <h3>Checklist Facts</h3>
            </div>
            <div className="aim-checklist">
              {task.closureChecklist.map((cue) => (
                <div className="aim-checklist-item" key={cue.key}>
                  <span className="aim-checkmark" aria-hidden="true">
                    {cue.isComplete ? "OK" : "!"}
                  </span>
                  <div>
                    <strong>{`${cue.label}: ${cue.statusLabel}`}</strong>
                    <LyraMuted>{cue.detail}</LyraMuted>
                  </div>
                </div>
              ))}
            </div>
          </LyraPanel>

          <LyraPanel>
            <div className="aim-task-panel-header">
              <LyraKicker>Task Relationships</LyraKicker>
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
          </LyraPanel>
        </LyraStack>
      </div>
    </LyraSurface>
  );
};
