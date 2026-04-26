import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import type { DashboardDimensionReportItem } from "../model/task-dashboard-view-model.js";
import {
  eyebrow,
  pageStack,
  pageTitle,
  sectionCopy,
  sectionTitle,
  tableMeta,
} from "./dashboard-styles.js";

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
      <Empty className="state-card border">
        <EmptyHeader>
          <EmptyTitle>Dimension not found.</EmptyTitle>
          <EmptyDescription>
            Return to the cockpit and select an available dimension report.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
    <section className={pageStack}>
      <div>
        <p className={eyebrow}>Dimension Detail</p>
        <h2 className={pageTitle}>{report.dimension.name}</h2>
      </div>
      <p className={sectionCopy}>{report.dimension.goal}</p>
      <p className={tableMeta}>Method: {report.dimension.evaluation_method}</p>

      {report.evaluations.length === 0 ? (
        <Empty className="state-card border">
          <EmptyHeader>
            <EmptyTitle>No dimension evaluation recorded yet.</EmptyTitle>
            <EmptyDescription>
              The score trend will appear after AIM records evaluation evidence.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <figure
          aria-label={`${report.dimension.name} score trend`}
          className="m-0 grid gap-3 border bg-card p-4"
        >
          <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={sectionTitle}>Score Trend</span>
            <span className={tableMeta}>Time on X axis, score on Y axis</span>
          </figcaption>
          <div className="grid min-h-[260px] grid-cols-[auto_minmax(0,1fr)] gap-3">
            <div
              className="flex flex-col justify-between py-2 text-xs font-medium text-muted-foreground"
              aria-hidden="true"
            >
              {scoreAxisLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            <div className="relative min-h-[260px] overflow-hidden border bg-muted/30">
              <span className="absolute left-3 top-3 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
                Score
              </span>
              <svg
                aria-hidden="true"
                className="absolute inset-0 size-full overflow-visible"
                focusable="false"
                preserveAspectRatio="none"
                viewBox="0 0 100 100"
              >
                <polyline
                  className="fill-none stroke-primary [stroke-linecap:round] [stroke-linejoin:round] [stroke-width:3]"
                  points={polylinePoints}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {points.map((point) => {
                const dateLabel = formatDateLabel(point.evaluation.created_at);

                return (
                  <button
                    aria-label={`${dateLabel} score ${point.evaluation.score}: ${point.evaluation.evaluation}`}
                    className="group absolute size-5 -translate-x-1/2 -translate-y-1/2 cursor-pointer border-0 bg-transparent p-0"
                    key={point.evaluation.id}
                    style={{
                      left: `${point.x}%`,
                      top: `${point.y}%`,
                    }}
                    type="button"
                  >
                    <span className="block size-full rounded-full border-[3px] border-background bg-primary ring-2 ring-primary/40" />
                    <span
                      className="invisible absolute bottom-[calc(100%+0.5rem)] left-1/2 w-[min(18rem,70vw)] -translate-x-1/2 translate-y-1 rounded-sm border bg-card p-3 text-xs font-medium text-card-foreground opacity-0 shadow-sm transition group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
                      role="tooltip"
                    >
                      {point.evaluation.evaluation}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div
            className="flex justify-between pl-9 text-xs font-medium text-muted-foreground"
            aria-hidden="true"
          >
            {report.evaluations.map((evaluation) => (
              <span key={evaluation.id}>
                {formatDateLabel(evaluation.created_at)}
              </span>
            ))}
          </div>
          <p className="m-0 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Time
          </p>
        </figure>
      )}
    </section>
  );
};
