import type { TaskWriteBulk, TaskWriteBulkEntry } from "@aim-ai/contract";

import { Card } from "../../../components/ui/card.js";
import {
  Chip,
  DetailCard,
  detailHeader,
  detailPanelHeader,
  detailSummary,
  detailSurface,
  detailTitle,
  Kicker,
  MarkdownContent,
  Muted,
  metadataLabel,
  metadataList,
  metadataRow,
  mutedText,
  pageStack,
  responsiveDetailGrid,
} from "./dashboard-styles.js";

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
      <Card className={detailSurface}>
        <Kicker>Task Write Bulk</Kicker>
        <h2>Task Write Bulk not found</h2>
        <Muted>
          The requested write intent is not available from the current dashboard
          data.
        </Muted>
      </Card>
    );
  }

  return (
    <Card className={detailSurface}>
      <header className={detailHeader}>
        <div className={pageStack}>
          <Kicker>Pre-approval write intent</Kicker>
          <h2 className={detailTitle}>{bulk.bulk_id}</h2>
        </div>
        <Muted className={detailSummary}>
          Read-only Coordinator proposal. This is not an executed task result
          and provides no approve, create, or delete action.
        </Muted>
      </header>

      <div className={responsiveDetailGrid}>
        <DetailCard>
          <div className={detailPanelHeader}>
            <Kicker>Content Markdown</Kicker>
            <h3>{bulk.bulk_id}</h3>
          </div>
          <MarkdownContent>{bulk.content_markdown}</MarkdownContent>
        </DetailCard>

        <div className={pageStack}>
          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>Intent Metadata</Kicker>
              <h3>Review Facts</h3>
            </div>
            <dl className={metadataList}>
              {metadataRows(bulk).map((row) => (
                <div className={metadataRow} key={row.label}>
                  <dt className={metadataLabel}>{row.label}</dt>
                  <dd className="m-0 break-words">{`${row.label}: ${row.value}`}</dd>
                </div>
              ))}
            </dl>
          </DetailCard>

          <DetailCard>
            <div className={detailPanelHeader}>
              <Kicker>Source Metadata</Kicker>
              <h3>Coordinator Trace</h3>
            </div>
            {bulk.source_metadata.length === 0 ? (
              <span className={mutedText}>No source metadata recorded</span>
            ) : (
              <dl className={metadataList}>
                {bulk.source_metadata.map((entry) => (
                  <div className={metadataRow} key={entry.key}>
                    <dt className={metadataLabel}>{entry.key}</dt>
                    <dd className="m-0 break-words">{`${entry.key}: ${entry.value}`}</dd>
                  </div>
                ))}
              </dl>
            )}
          </DetailCard>
        </div>
      </div>

      <DetailCard>
        <div className={detailPanelHeader}>
          <Kicker>Entries</Kicker>
          <h3>Proposed write operations</h3>
        </div>
        <div className="grid gap-3">
          {bulk.entries.map((entry) => (
            <article
              className="flex flex-col gap-3 border-t pt-4 first:border-t-0 first:pt-0"
              key={entry.id}
            >
              <div className="flex items-start justify-between gap-4 max-md:flex-col">
                <div>
                  <Kicker>{entry.action}</Kicker>
                  <h4>{entry.id}</h4>
                </div>
                <Chip>{entry.source}</Chip>
              </div>
              <Muted>{entry.reason}</Muted>
              <dl className={metadataList}>
                <div className={metadataRow}>
                  <dt className={metadataLabel}>Depends On</dt>
                  <dd className="m-0 break-words">{`Depends On: ${entry.depends_on.join(", ") || "None"}`}</dd>
                </div>
                {describeEntryPayload(entry).map((row) => (
                  <div className={metadataRow} key={row.label}>
                    <dt className={metadataLabel}>{row.label}</dt>
                    <dd className="m-0 break-words">{`${row.label}: ${row.value}`}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </DetailCard>
    </Card>
  );
};
