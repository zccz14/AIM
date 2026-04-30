export type ProjectBudgetThresholds = {
  cost_warning_threshold: null | number;
  token_warning_threshold: null | number;
};

export type ProjectTokenUsageTotals = {
  cache: { read: number; write: number };
  cost: number;
  input: number;
  messages: number;
  output: number;
  reasoning: number;
  total: number;
};

export const buildProjectTokenBudgetWarning = (
  thresholds: ProjectBudgetThresholds,
  totals: ProjectTokenUsageTotals,
) => {
  const exceedsTokenThreshold =
    thresholds.token_warning_threshold !== null &&
    totals.total > thresholds.token_warning_threshold;
  const exceedsCostThreshold =
    thresholds.cost_warning_threshold !== null &&
    totals.cost > thresholds.cost_warning_threshold;

  if (exceedsTokenThreshold) {
    return {
      status: "exceeded" as const,
      token_warning_threshold: thresholds.token_warning_threshold,
      cost_warning_threshold: thresholds.cost_warning_threshold,
      message:
        "Project token usage exceeds the configured token warning threshold.",
    };
  }

  if (exceedsCostThreshold) {
    return {
      status: "exceeded" as const,
      token_warning_threshold: thresholds.token_warning_threshold,
      cost_warning_threshold: thresholds.cost_warning_threshold,
      message:
        "Project token usage exceeds the configured cost warning threshold.",
    };
  }

  return {
    status:
      thresholds.token_warning_threshold === null &&
      thresholds.cost_warning_threshold === null
        ? ("not_configured" as const)
        : ("within_budget" as const),
    token_warning_threshold: thresholds.token_warning_threshold,
    cost_warning_threshold: thresholds.cost_warning_threshold,
    message: null,
  };
};

export type ProjectBudgetWarning = ReturnType<
  typeof buildProjectTokenBudgetWarning
>;
