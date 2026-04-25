import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import {
  LyraKicker,
  LyraMuted,
  LyraPanel,
  LyraStack,
  LyraSurface,
} from "../../../components/ui/lyra-surface.js";
import type { DashboardManagerReport } from "../model/task-dashboard-view-model.js";

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
      <LyraSurface className="aim-empty-state aim-task-details">
        <LyraKicker>Manager Report</LyraKicker>
        <h2>Manager Report not found</h2>
        <LyraMuted>
          The requested report is not available from the current Manager Report
          evidence set.
        </LyraMuted>
      </LyraSurface>
    );
  }

  return (
    <LyraSurface className="aim-task-details aim-stack">
      <header className="aim-task-details-header">
        <LyraStack>
          <LyraKicker>Manager Report</LyraKicker>
          <h2 className="aim-task-title">{report.id}</h2>
        </LyraStack>
        <LyraMuted className="aim-task-summary">
          Read-only Coordinator handoff direction for baseline convergence. This
          surface exposes the report content and metadata without write actions.
        </LyraMuted>
      </header>

      <div className="aim-task-grid">
        <LyraPanel>
          <div className="aim-task-panel-header">
            <LyraKicker>Direction Markdown</LyraKicker>
            <h3>content_markdown</h3>
          </div>
          <div className="aim-task-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {report.contentMarkdown}
            </ReactMarkdown>
          </div>
        </LyraPanel>

        <LyraPanel>
          <div className="aim-task-panel-header">
            <LyraKicker>Report Metadata</LyraKicker>
            <h3>Handoff Context</h3>
          </div>
          <dl className="aim-task-metadata">
            {metadataRows(report).map((row) => (
              <div className="aim-task-meta-row" key={row.label}>
                <dt>{row.label}</dt>
                <dd>{`${row.label}: ${row.value}`}</dd>
              </div>
            ))}
          </dl>
        </LyraPanel>
      </div>
    </LyraSurface>
  );
};
