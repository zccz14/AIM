import { FileText } from "lucide-react";

import { Button } from "../../../components/ui/button.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import type { DashboardManagerReport } from "../model/task-dashboard-view-model.js";

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
    className="cockpit-region surface-table evidence-panel"
    id="manager-reports"
  >
    <div className="region-header">
      <div>
        <p className="eyebrow">Coordinator Handoff</p>
        <h2 className="section-title" id="manager-reports-title">
          Manager Reports
        </h2>
      </div>
      <p className="section-copy">
        Direction evidence read from the configured AIM Server for the visible
        project coordinates. Reports stay read-only here: no creation, editing,
        or deletion actions are exposed.
      </p>
    </div>

    {managerReports.length === 0 ? (
      <Empty className="state-card manager-report-empty border">
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
      <div className="manager-report-list">
        {managerReports.map((report) => (
          <article
            className="manager-report-card"
            key={`${report.projectPath}:${report.id}`}
          >
            <div className="manager-report-card__main">
              <div className="manager-report-card__title-row">
                <FileText aria-hidden="true" />
                <h3>{report.id}</h3>
              </div>
              <p className="muted-text">
                {getReportPreview(report.contentMarkdown)}
              </p>
              <dl className="manager-report-facts">
                <div>
                  <dt>Baseline</dt>
                  <dd>{report.baselineRef ?? "Unspecified"}</dd>
                </div>
                <div>
                  <dt>Created</dt>
                  <dd>{report.createdAt}</dd>
                </div>
                <div>
                  <dt>Project</dt>
                  <dd>{report.projectPath}</dd>
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
