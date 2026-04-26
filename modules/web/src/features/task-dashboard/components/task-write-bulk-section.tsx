import type { TaskWriteBulk } from "@aim-ai/contract";

import { Button } from "../../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
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
  cardHeader,
  cockpitRegion,
  eyebrow,
  pageStack,
  regionHeader,
  sectionCopy,
  sectionTitle,
} from "./dashboard-styles.js";

export const TaskWriteBulkSection = ({
  bulks,
  onSelectBulk,
}: {
  bulks: TaskWriteBulk[];
  onSelectBulk: (bulkId: string) => void;
}) => (
  <section
    aria-label="Task Write Bulk intents"
    className={`${pageStack} ${cockpitRegion}`}
    id="task-write-bulks"
  >
    <div className={regionHeader}>
      <div>
        <p className={eyebrow}>Task Write Bulk</p>
        <h2 className={sectionTitle}>Approval Queue Observability</h2>
      </div>
      <p className={sectionCopy}>
        Pre-approval Coordinator write intent. No tasks have been created or
        executed from these records.
      </p>
    </div>
    <Card>
      <CardHeader className={cardHeader}>
        <p className={eyebrow}>Coordinator Candidates</p>
        <CardTitle className={sectionTitle}>Task Write Bulks</CardTitle>
        <CardDescription>
          Pre-approval Coordinator write intent. No tasks have been created or
          executed from these records.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {bulks.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyTitle>No Task Write Bulk intent available</EmptyTitle>
              <EmptyDescription>
                The configured server has no pre-approval Coordinator write
                intent to inspect.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid gap-3">
            {bulks.map((bulk) => (
              <Button
                className="h-auto justify-between p-4 text-left max-md:flex-col max-md:items-stretch"
                key={bulk.bulk_id}
                onClick={() => onSelectBulk(bulk.bulk_id)}
                type="button"
                variant="outline"
              >
                <span className="flex flex-col gap-1">
                  <strong>{bulk.bulk_id}</strong>
                  <span className="text-muted-foreground">
                    {bulk.project_path}
                  </span>
                </span>
                <span className="flex flex-col items-end gap-1 text-xs text-muted-foreground max-md:items-start">
                  <span>{`${bulk.entries.length} proposed entries`}</span>
                  <span>{bulk.baseline_ref ?? "No baseline_ref"}</span>
                  <span>{bulk.created_at}</span>
                </span>
              </Button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  </section>
);
