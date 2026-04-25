import type { TaskWriteBulk } from "@aim-ai/contract";

import { Button } from "../../../components/ui/button.js";
import { Card } from "../../../components/ui/card.js";

export const TaskWriteBulkSection = ({
  bulks,
  onSelectBulk,
}: {
  bulks: TaskWriteBulk[];
  onSelectBulk: (bulkId: string) => void;
}) => (
  <section
    aria-label="Task Write Bulk intents"
    className="cockpit-region section-stack"
    id="task-write-bulks"
  >
    <div className="region-header">
      <div>
        <p className="eyebrow">Task Write Bulk</p>
        <h2 className="section-title">Approval Queue Observability</h2>
      </div>
      <p className="section-copy">
        Pre-approval Coordinator write intent. No tasks have been created or
        executed from these records.
      </p>
    </div>
    <Card className="evidence-panel section-stack">
      <div>
        <p className="eyebrow">Coordinator Candidates</p>
        <h3 className="section-title">Task Write Bulks</h3>
      </div>
      <p className="section-copy">
        Pre-approval Coordinator write intent. No tasks have been created or
        executed from these records.
      </p>
      {bulks.length === 0 ? (
        <p className="muted-text">
          No Task Write Bulk intent is available from the configured server.
        </p>
      ) : (
        <div className="task-write-bulk-list">
          {bulks.map((bulk) => (
            <Button
              className="task-write-bulk-row"
              key={bulk.bulk_id}
              onClick={() => onSelectBulk(bulk.bulk_id)}
              type="button"
              variant="outline"
            >
              <span className="task-write-bulk-row__main">
                <strong>{bulk.bulk_id}</strong>
                <span>{bulk.project_path}</span>
              </span>
              <span className="task-write-bulk-row__meta">
                <span>{`${bulk.entries.length} proposed entries`}</span>
                <span>{bulk.baseline_ref ?? "No baseline_ref"}</span>
                <span>{bulk.created_at}</span>
              </span>
            </Button>
          ))}
        </div>
      )}
    </Card>
  </section>
);
