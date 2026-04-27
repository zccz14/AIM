import type { DimensionEvaluation, Project } from "@aim-ai/contract";
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
import { useI18n } from "../../../lib/i18n.js";
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

const getGitHubRepositoryUrl = (gitOriginUrl: string | null | undefined) => {
  const match = gitOriginUrl?.match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );

  return match ? `https://github.com/${match[1]}/${match[2]}` : null;
};

const CommitReference = ({
  commitSha,
  repositoryUrl,
}: {
  commitSha: string;
  repositoryUrl: string | null;
}) => {
  const className =
    "rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[0.72rem] font-semibold text-foreground";

  if (repositoryUrl) {
    return (
      <a
        className={`${className} underline underline-offset-4`}
        href={`${repositoryUrl}/commit/${commitSha}`}
        rel="noreferrer"
        target="_blank"
      >
        {commitSha}
      </a>
    );
  }

  return <code className={className}>{commitSha}</code>;
};

export const DimensionDetailsPage = ({
  project,
  report,
}: {
  project: Project | null;
  report: DashboardDimensionReportItem | null;
}) => {
  const { t } = useI18n();
  const scoreTrendChartConfig = {
    score: {
      label: t("score"),
      color: "var(--chart-1)",
    },
  } satisfies ChartConfig;

  if (!report) {
    return (
      <Empty className="state-card border">
        <EmptyHeader>
          <EmptyTitle>{t("dimensionNotFound")}</EmptyTitle>
          <EmptyDescription>
            {t("dimensionUnavailableDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  const scoreTrendData = report.evaluations.map((evaluation) => ({
    ...evaluation,
    date: formatDateLabel(evaluation.created_at),
    scoreLabel: `${t("score")} ${evaluation.score}`,
  }));
  const latestEvaluation =
    report.latestEvaluation ??
    report.evaluations.reduce<DimensionEvaluation | null>(
      (latest, evaluation) =>
        latest === null || evaluation.created_at > latest.created_at
          ? evaluation
          : latest,
      null,
    );
  const repositoryUrl = getGitHubRepositoryUrl(project?.git_origin_url);

  return (
    <section className={pageStack}>
      <div>
        <p className={eyebrow}>{t("dimensionDetail")}</p>
        <h2 className={pageTitle}>{report.dimension.name}</h2>
      </div>
      <p className={sectionCopy}>{report.dimension.goal}</p>
      <p className={tableMeta}>
        {t("method")}: {report.dimension.evaluation_method}
      </p>

      {report.evaluations.length === 0 ? (
        <Empty className="state-card border">
          <EmptyHeader>
            <EmptyTitle>{t("noDimensionEvaluation")}</EmptyTitle>
            <EmptyDescription>
              {t("dimensionEvaluationDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {latestEvaluation ? (
            <section
              aria-label={t("latestEvaluation")}
              className="grid gap-3 border bg-card p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="grid gap-1">
                  <p className={eyebrow}>{t("latestEvaluation")}</p>
                  <p className="m-0 text-2xl font-semibold tracking-tight">
                    {latestEvaluation.score}/100
                  </p>
                </div>
                <p className={tableMeta}>
                  {formatDateLabel(latestEvaluation.created_at)} · {t("commit")}{" "}
                  <CommitReference
                    commitSha={latestEvaluation.commit_sha}
                    repositoryUrl={repositoryUrl}
                  />
                </p>
              </div>
              <p className="m-0 text-sm/relaxed text-foreground">
                {latestEvaluation.evaluation}
              </p>
            </section>
          ) : null}

          <figure
            aria-label={`${report.dimension.name} ${t("dimensionScoreTrend")}`}
            className="m-0 grid gap-3 border bg-card p-4"
          >
            <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
              <span className={sectionTitle}>{t("scoreTrend")}</span>
              <span className={tableMeta}>{t("scoreTrendDescription")}</span>
            </figcaption>
            <p className="m-0 text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
              {t("score")}
            </p>
            <ChartContainer
              className="h-[260px] w-full"
              config={scoreTrendChartConfig}
            >
              <LineChart
                accessibilityLayer
                aria-label={`${report.dimension.name} ${t("dimensionScoreTrendChart")}`}
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
                        payload[0]?.payload.date ?? t("evaluationSignals")
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
              {t("time")}
            </p>
            <div className="grid gap-2 text-xs/relaxed text-muted-foreground">
              {scoreTrendData.map((evaluation) => (
                <p className="m-0" key={evaluation.id}>
                  <span className="font-medium text-foreground">
                    {evaluation.date} {evaluation.scoreLabel}
                  </span>
                  {" · "}
                  {t("commit")}{" "}
                  <CommitReference
                    commitSha={evaluation.commit_sha}
                    repositoryUrl={repositoryUrl}
                  />
                  : {evaluation.evaluation}
                </p>
              ))}
            </div>
          </figure>
        </>
      )}
    </section>
  );
};
