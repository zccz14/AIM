import { FileText } from "lucide-react";

import { Button } from "../../../components/ui/button.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import type { DashboardManagerReport } from "../model/task-dashboard-view-model.js";
import {
  cockpitRegion,
  eyebrow,
  metadataLabel,
  pageStack,
  panelStack,
  regionHeader,
  sectionCopy,
  sectionTitle,
} from "./dashboard-styles.js";

const getReportPreview = (contentMarkdown: string) => {
  const [firstLine = ""] = contentMarkdown
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (firstLine.length === 0) {
    return "No report content recorded.";
  }

  return firstLine.length <= 120 ? firstLine : `${firstLine.slice(0, 117)}...`;
};

export const ManagerReportSection = ({
  managerReports,
  onSelectReport,
}: {
  managerReports: DashboardManagerReport[];
  onSelectReport: (report: DashboardManagerReport) => void;
}) => (
  <section
    aria-labelledby="manager-reports-title"
    className={`${pageStack} ${cockpitRegion}`}
    id="manager-reports"
  >
    <div className={regionHeader}>
      <div>
        <p className={eyebrow}>Coordinator Handoff</p>
        <h2 className={sectionTitle} id="manager-reports-title">
          Manager Reports
        </h2>
      </div>
      <p className={sectionCopy}>
        Direction evidence read from the configured AIM Server for the visible
        project coordinates. Reports stay read-only here: no creation, editing,
        or deletion actions are exposed.
      </p>
    </div>

    {managerReports.length === 0 ? (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>No Manager Reports available</EmptyTitle>
          <EmptyDescription>
            No Manager Reports are available for the current Task Pool project
            paths. Create or refresh task evidence for a project that has
            manager handoff reports.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    ) : (
      <div className="grid gap-3">
        {managerReports.map((report) => (
          <article
            className="grid items-center gap-4 border-t py-4 first:border-t-0 first:pt-0 last:pb-0 md:grid-cols-[minmax(0,1fr)_auto]"
            key={`${report.projectPath}:${report.id}`}
          >
            <div className="flex min-w-0 flex-col gap-3">
              <div className="flex items-center gap-3 text-foreground">
                <FileText aria-hidden="true" />
                <h3 className="m-0 break-words text-sm font-medium">
                  {report.id}
                </h3>
              </div>
              <p className={sectionCopy}>
                {getReportPreview(report.contentMarkdown)}
              </p>
              <dl className="m-0 grid gap-3 md:grid-cols-3">
                <div className={panelStack}>
                  <dt className={metadataLabel}>Baseline</dt>
                  <dd className="m-0 break-words">
                    {report.baselineRef ?? "Unspecified"}
                  </dd>
                </div>
                <div className={panelStack}>
                  <dt className={metadataLabel}>Created</dt>
                  <dd className="m-0 break-words">{report.createdAt}</dd>
                </div>
                <div className={panelStack}>
                  <dt className={metadataLabel}>Project</dt>
                  <dd className="m-0 break-words">{report.projectPath}</dd>
                </div>
              </dl>
            </div>
            <Button onClick={() => onSelectReport(report)} variant="outline">
              Read Report
            </Button>
          </article>
        ))}
      </div>
    )}
  </section>
);
