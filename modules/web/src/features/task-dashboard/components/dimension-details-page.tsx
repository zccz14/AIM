import { Card } from "../../../components/ui/card.js";
import type { DashboardDimensionReportItem } from "../model/task-dashboard-view-model.js";

const scoreAxisLabels = [100, 50, 0];

const formatDateLabel = (value: string) => value.slice(0, 10);

const getPointPosition = (index: number, total: number, score: number) => ({
  x: total <= 1 ? 50 : 10 + (index / (total - 1)) * 80,
  y: 100 - Math.max(0, Math.min(100, score)),
});

export const DimensionDetailsPage = ({
  report,
}: {
  report: DashboardDimensionReportItem | null;
}) => {
  if (!report) {
    return (
      <Card className="state-card">
        <p className="muted-text">Dimension not found.</p>
      </Card>
    );
  }

  const points = report.evaluations.map((evaluation, index) => ({
    evaluation,
    ...getPointPosition(index, report.evaluations.length, evaluation.score),
  }));
  const polylinePoints = points
    .map((point) => `${point.x},${point.y}`)
    .join(" ");

  return (
    <section className="section-stack route-panel dimension-details-page">
      <div>
        <p className="eyebrow">Dimension Detail</p>
        <h2 className="page-title">{report.dimension.name}</h2>
      </div>
      <p className="section-copy">{report.dimension.goal}</p>
      <p className="table-meta">Method: {report.dimension.evaluation_method}</p>

      {report.evaluations.length === 0 ? (
        <Card className="state-card">
          <p className="muted-text">No dimension evaluation recorded yet.</p>
        </Card>
      ) : (
        <figure
          aria-label={`${report.dimension.name} score trend`}
          className="dimension-trend"
        >
          <figcaption className="dimension-trend__header">
            <span className="section-title">Score Trend</span>
            <span className="table-meta">Time on X axis, score on Y axis</span>
          </figcaption>
          <div className="dimension-trend__plot">
            <div className="dimension-trend__y-axis" aria-hidden="true">
              {scoreAxisLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="dimension-trend__canvas">
              <span className="dimension-trend__axis-label dimension-trend__axis-label--y">
                Score
              </span>
              <svg
                aria-hidden="true"
                className="dimension-trend__line"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <polyline
                  points={polylinePoints}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {points.map((point) => {
                const dateLabel = formatDateLabel(point.evaluation.created_at);

                return (
                  <button
                    aria-label={`${dateLabel} score ${point.evaluation.score}: ${point.evaluation.evaluation}`}
                    className="dimension-trend-point"
                    key={point.evaluation.id}
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                    }}
                    type="button"
                  >
                    <span className="dimension-trend-point__dot" />
                    <span
                      className="dimension-trend-point__tooltip"
                      role="tooltip"
                    >
                      {point.evaluation.evaluation}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="dimension-trend__x-axis" aria-hidden="true">
            {report.evaluations.map((evaluation) => (
              <span key={evaluation.id}>
                {formatDateLabel(evaluation.created_at)}
              </span>
            ))}
          </div>
          <p className="dimension-trend__x-label">Time</p>
        </figure>
      )}
    </section>
  );
};
