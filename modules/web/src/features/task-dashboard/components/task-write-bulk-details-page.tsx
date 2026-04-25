import type { TaskWriteBulk, TaskWriteBulkEntry } from "@aim-ai/contract";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  LyraKicker,
  LyraMuted,
  LyraPanel,
  LyraStack,
  LyraSurface,
} from "../../../components/ui/lyra-surface.js";

const metadataRows = (bulk: TaskWriteBulk) => [
  { label: "Bulk ID", value: bulk.bulk_id },
  { label: "Project Path", value: bulk.project_path },
  { label: "Baseline Ref", value: bulk.baseline_ref ?? "None" },
  { label: "Created At", value: bulk.created_at },
  { label: "Updated At", value: bulk.updated_at },
];

const describeEntryPayload = (entry: TaskWriteBulkEntry) => {
  if (entry.create) {
    return [
      { label: "Candidate Task Spec", value: entry.create.candidate_task_spec },
      { label: "Project Path", value: entry.create.project_path },
      {
        label: "Dependencies",
        value: entry.create.dependencies.join(", ") || "None",
      },
      { label: "Verification Route", value: entry.create.verification_route },
    ];
  }

  if (entry.delete) {
    return [
      { label: "Target Task ID", value: entry.delete.target_task_id },
      { label: "Delete Reason", value: entry.delete.delete_reason },
      { label: "Replacement", value: entry.delete.replacement ?? "None" },
    ];
  }

  return [{ label: "Payload", value: "No action payload recorded" }];
};

export const TaskWriteBulkDetailsPage = ({
  bulk,
}: {
  bulk: TaskWriteBulk | null;
}) => {
  if (!bulk) {
    return (
      <LyraSurface className="aim-empty-state aim-task-details">
        <LyraKicker>Task Write Bulk</LyraKicker>
        <h2>Task Write Bulk not found</h2>
        <LyraMuted>
          The requested write intent is not available from the current dashboard
          data.
        </LyraMuted>
      </LyraSurface>
    );
  }

  return (
    <LyraSurface className="aim-task-details aim-stack">
      <header className="aim-task-details-header">
        <LyraStack>
          <LyraKicker>Pre-approval write intent</LyraKicker>
          <h2 className="aim-task-title">{bulk.bulk_id}</h2>
        </LyraStack>
        <LyraMuted className="aim-task-summary">
          Read-only Coordinator proposal. This is not an executed task result
          and provides no approve, create, or delete action.
        </LyraMuted>
      </header>

      <div className="aim-task-grid">
        <LyraPanel>
          <div className="aim-task-panel-header">
            <LyraKicker>Content Markdown</LyraKicker>
            <h3>{bulk.bulk_id}</h3>
          </div>
          <div className="aim-task-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {bulk.content_markdown}
            </ReactMarkdown>
          </div>
        </LyraPanel>

        <LyraStack>
          <LyraPanel>
            <div className="aim-task-panel-header">
              <LyraKicker>Intent Metadata</LyraKicker>
              <h3>Review Facts</h3>
            </div>
            <dl className="aim-task-metadata">
              {metadataRows(bulk).map((row) => (
                <div className="aim-task-meta-row" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{`${row.label}: ${row.value}`}</dd>
                </div>
              ))}
            </dl>
          </LyraPanel>

          <LyraPanel>
            <div className="aim-task-panel-header">
              <LyraKicker>Source Metadata</LyraKicker>
              <h3>Coordinator Trace</h3>
            </div>
            {bulk.source_metadata.length === 0 ? (
              <span className="aim-muted">No source metadata recorded</span>
            ) : (
              <dl className="aim-task-metadata">
                {bulk.source_metadata.map((entry) => (
                  <div className="aim-task-meta-row" key={entry.key}>
                    <dt>{entry.key}</dt>
                    <dd>{`${entry.key}: ${entry.value}`}</dd>
                  </div>
                ))}
              </dl>
            )}
          </LyraPanel>
        </LyraStack>
      </div>

      <LyraPanel>
        <div className="aim-task-panel-header">
          <LyraKicker>Entries</LyraKicker>
          <h3>Proposed write operations</h3>
        </div>
        <div className="task-write-bulk-entry-list">
          {bulk.entries.map((entry) => (
            <article className="task-write-bulk-entry" key={entry.id}>
              <div className="task-write-bulk-entry__header">
                <div>
                  <p className="eyebrow">{entry.action}</p>
                  <h4>{entry.id}</h4>
                </div>
                <span className="aim-task-chip">{entry.source}</span>
              </div>
              <p className="aim-muted">{entry.reason}</p>
              <dl className="aim-task-metadata">
                <div className="aim-task-meta-row">
                  <dt>Depends On</dt>
                  <dd>{`Depends On: ${entry.depends_on.join(", ") || "None"}`}</dd>
                </div>
                {describeEntryPayload(entry).map((row) => (
                  <div className="aim-task-meta-row" key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{`${row.label}: ${row.value}`}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </LyraPanel>
    </LyraSurface>
  );
};
