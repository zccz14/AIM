import { Card } from "../../../components/ui/card.js";
import type { DashboardManagerReport } from "../model/task-dashboard-view-model.js";
import {
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
  responsiveDetailGrid,
  sectionStack,
} from "./dashboard-styles.js";

const metadataRows = (report: DashboardManagerReport) => [
  { label: "Report ID", value: report.id },
  { label: "Project Path", value: report.projectPath },
  { label: "Baseline Ref", value: report.baselineRef ?? "Unspecified" },
  { label: "Created At", value: report.createdAt },
];

export const ManagerReportDetailsPage = ({
  report,
}: {
  report: DashboardManagerReport | null;
}) => {
  if (!report) {
    return (
      <Card className={detailSurface}>
        <Kicker>Manager Report</Kicker>
        <h2>Manager Report not found</h2>
        <Muted>
          The requested report is not available from the current Manager Report
          evidence set.
        </Muted>
      </Card>
    );
  }

  return (
    <Card className={detailSurface}>
      <header className={detailHeader}>
        <div className={sectionStack}>
          <Kicker>Manager Report</Kicker>
          <h2 className={detailTitle}>{report.id}</h2>
        </div>
        <Muted className={detailSummary}>
          Read-only Coordinator handoff direction for baseline convergence. This
          surface exposes the report content and metadata without write actions.
        </Muted>
      </header>

      <div className={responsiveDetailGrid}>
        <DetailCard>
          <div className={detailPanelHeader}>
            <Kicker>Direction Markdown</Kicker>
            <h3>content_markdown</h3>
          </div>
          <MarkdownContent>{report.contentMarkdown}</MarkdownContent>
        </DetailCard>

        <DetailCard>
          <div className={detailPanelHeader}>
            <Kicker>Report Metadata</Kicker>
            <h3>Handoff Context</h3>
          </div>
          <dl className={metadataList}>
            {metadataRows(report).map((row) => (
              <div className={metadataRow} key={row.label}>
                <dt className={metadataLabel}>{row.label}</dt>
                <dd className="m-0 break-words">{`${row.label}: ${row.value}`}</dd>
              </div>
            ))}
          </dl>
        </DetailCard>
      </div>
    </Card>
  );
};
