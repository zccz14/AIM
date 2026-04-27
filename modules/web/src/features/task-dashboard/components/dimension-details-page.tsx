import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "../../../components/ui/chart.js";
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

const formatDateLabel = (value: string) => value.slice(0, 16).replace("T", " ");

const scoreTrendChartConfig = {
  score: {
    label: "Score",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

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

  const scoreTrendData = report.evaluations.map((evaluation) => ({
    ...evaluation,
    date: formatDateLabel(evaluation.created_at),
    scoreLabel: `Score ${evaluation.score}`,
  }));

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
          <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Score
          </p>
          <ChartContainer
            className="h-[260px] w-full"
            config={scoreTrendChartConfig}
          >
            <LineChart
              accessibilityLayer
              aria-label={`${report.dimension.name} score trend chart`}
              data={scoreTrendData}
              margin={{ left: 8, right: 12 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                interval={0}
                tickLine={false}
                tickMargin={8}
              />
              <YAxis
                allowDecimals={false}
                dataKey="score"
                domain={[0, 100]}
                tickLine={false}
                width={32}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      payload[0]?.payload.date ?? "Evaluation"
                    }
                  />
                }
              />
              <Line
                dataKey="score"
                dot={{ fill: "var(--color-score)", r: 4 }}
                stroke="var(--color-score)"
                strokeWidth={2}
                type="monotone"
              />
            </LineChart>
          </ChartContainer>
          <p className="m-0 text-center text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Time
          </p>
          <div className="grid gap-2 text-xs/relaxed text-muted-foreground">
            {scoreTrendData.map((evaluation) => (
              <p className="m-0" key={evaluation.id}>
                <span className="font-medium text-foreground">
                  {evaluation.date} {evaluation.scoreLabel}
                </span>
                : {evaluation.evaluation}
              </p>
            ))}
          </div>
        </figure>
      )}
    </section>
  );
};
