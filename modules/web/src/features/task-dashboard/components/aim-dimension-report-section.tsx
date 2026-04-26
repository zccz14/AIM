import { Gauge } from "lucide-react";

import { Card } from "../../../components/ui/card.js";
import { useI18n } from "../../../lib/i18n.js";
import type { DashboardDimensionReportItem } from "../model/task-dashboard-view-model.js";

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
      className="cockpit-region aim-dimension-report"
      id="aim-dimension-report"
    >
      <div className="region-header aim-dimension-report__header">
        <div>
          <p className="eyebrow">{t("goalFit")}</p>
          <h2 className="section-title">{t("aimDimensionReport")}</h2>
        </div>
        <p className="section-copy">{t("aimDimensionReportDescription")}</p>
      </div>

      {dimensionReports.length === 0 ? (
        <Card className="state-card aim-dimension-report__empty">
          <p className="muted-text">{t("noAimDimensionReport")}</p>
        </Card>
      ) : (
        <div className="aim-dimension-list">
          {dimensionReports.map(({ dimension, latestEvaluation }) => (
            <article className="aim-dimension-item" key={dimension.id}>
              <div className="aim-dimension-item__main">
                <div className="manager-report-card__title-row">
                  <Gauge aria-hidden="true" size={18} />
                  <h3>
                    <button
                      className="link-button"
                      onClick={() => onSelectDimension(dimension.id)}
                      type="button"
                    >
                      {dimension.name}
                    </button>
                  </h3>
                </div>
                <p className="section-copy">{dimension.goal}</p>
                <p className="table-meta">
                  Method: {dimension.evaluation_method}
                </p>
                <p className="muted-text">
                  {latestEvaluation?.evaluation ?? t("noDimensionEvaluation")}
                </p>
              </div>
              <div className="aim-dimension-score" title="Latest score">
                {latestEvaluation
                  ? `${latestEvaluation.score}/100`
                  : "No score"}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
