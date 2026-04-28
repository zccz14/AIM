import { Gauge } from "lucide-react";

import { Badge } from "../../../components/ui/badge.js";
import { Button } from "../../../components/ui/button.js";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "../../../components/ui/empty.js";
import { useI18n } from "../../../lib/i18n.js";
import type {
  DashboardDimensionFreshness,
  DashboardDimensionReportItem,
} from "../model/task-dashboard-view-model.js";
import {
  cockpitRegion,
  eyebrow,
  pageStack,
  regionHeader,
  sectionCopy,
  sectionTitle,
  tableMeta,
} from "./dashboard-styles.js";

const shortCommitSha = (commitSha: string | null) =>
  commitSha ? commitSha.slice(0, 12) : null;

const getFreshnessVariant = (status: DashboardDimensionFreshness["status"]) => {
  switch (status) {
    case "current":
      return "default";
    case "stale":
      return "destructive";
    case "missing":
      return "secondary";
    case "unknown":
      return "outline";
  }
};

const freshnessLabelKeys = {
  current: "dimensionFreshnessCurrent",
  missing: "dimensionFreshnessMissing",
  stale: "dimensionFreshnessStale",
  unknown: "dimensionFreshnessUnknown",
} as const;

const freshnessDescriptionKeys = {
  current: "dimensionFreshnessCurrentDescription",
  missing: "dimensionFreshnessMissingDescription",
  stale: "dimensionFreshnessStaleDescription",
  unknown: "dimensionFreshnessUnknownDescription",
} as const;

export const AimDimensionReportSection = ({
  dimensionReports,
  onSelectDimension,
}: {
  dimensionReports: DashboardDimensionReportItem[];
  onSelectDimension: (dimensionId: string) => void;
}) => {
  const { t } = useI18n();

  return (
    <section
      aria-label={t("aimDimensionReportAria")}
      className={`${pageStack} ${cockpitRegion}`}
      id="aim-dimension-report"
    >
      <div className={regionHeader}>
        <div>
          <p className={eyebrow}>{t("goalFit")}</p>
          <h2 className={sectionTitle}>{t("aimDimensionReport")}</h2>
        </div>
        <p className={sectionCopy}>{t("aimDimensionReportDescription")}</p>
      </div>

      {dimensionReports.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>{t("noAimDimensionReport")}</EmptyTitle>
            <EmptyDescription>
              {t("dimensionEvaluationDescription")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-3">
          {dimensionReports.map(
            ({ dimension, freshness, latestEvaluation }) => (
              <article
                className="grid items-center gap-4 border bg-card p-4 md:grid-cols-[minmax(0,1fr)_auto]"
                key={dimension.id}
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <div className="flex items-center gap-3 text-foreground">
                    <Gauge aria-hidden="true" />
                    <h3 className="m-0">
                      <Button
                        onClick={() => onSelectDimension(dimension.id)}
                        type="button"
                        variant="link"
                      >
                        {dimension.name}
                      </Button>
                    </h3>
                  </div>
                  <p className={sectionCopy}>{dimension.goal}</p>
                  <p className={tableMeta}>
                    {t("method")}: {dimension.evaluation_method}
                  </p>
                  <p className={sectionCopy}>
                    {latestEvaluation?.evaluation ?? t("noDimensionEvaluation")}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getFreshnessVariant(freshness.status)}>
                      {t(freshnessLabelKeys[freshness.status])}
                    </Badge>
                    <p className={tableMeta}>
                      {t("currentBaseline")}:{" "}
                      {shortCommitSha(freshness.currentBaselineCommitSha) ??
                        t("none")}{" "}
                      · {t("dimensionFreshnessEvaluation")}:{" "}
                      {shortCommitSha(freshness.evaluationCommitSha) ??
                        t("none")}
                    </p>
                  </div>
                  <p className={tableMeta}>
                    {t(freshnessDescriptionKeys[freshness.status])}
                  </p>
                </div>
                <Badge
                  className="h-auto py-2"
                  title={t("latestScore")}
                  variant="secondary"
                >
                  {latestEvaluation
                    ? `${latestEvaluation.score}/100`
                    : t("noScore")}
                </Badge>
              </article>
            ),
          )}
        </div>
      )}
    </section>
  );
};
