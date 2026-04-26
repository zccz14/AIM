import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type Locale = "en" | "zh";

const LOCALE_STORAGE_KEY = "aim.web.locale";

const messages = {
  en: {
    activeUnfinishedTasks: "Active Unfinished Tasks",
    aimDimensionReport: "AIM Dimension Report",
    aimDimensionReportAria: "AIM Dimension report",
    aimDimensionReportDescription:
      "Dimension scores surface before task mechanics so the Director sees goal fit first.",
    aimNavigator: "AIM Navigator",
    backToDashboard: "Back to Dashboard",
    baselineConvergenceCockpit: "Baseline Convergence Cockpit",
    baselineConvergenceForDirector: "Baseline convergence for the AIM Director",
    baselineConvergenceMap: "Convergence Map",
    baselineConvergenceMapRegion: "Baseline convergence map",
    baselineReview: "Baseline Review",
    beforeYouSend: "Before You Send",
    cancel: "Cancel",
    completedTaskFeedback: "Completed Task Feedback",
    completedResultActivity: "Completed Result Activity",
    coordinatorInput: "Coordinator Input",
    createTask: "Create Task",
    createTaskDescription:
      "Create a new AIM task from the same Director workspace used for convergence review.",
    createTaskFormSummary:
      "Draft task intake beside the same evidence vocabulary used for convergence review.",
    createTaskFormTitle:
      "Shape a focused brief before it enters the task pool.",
    creatingTask: "Creating Task...",
    dashboardError: "Dashboard Error",
    dashboardStatus: "Dashboard Status",
    decisionObservability: "Decision Observability",
    evidenceLedgerDescription:
      "The ledger keeps active tasks, Coordinator feedback, and completed outcomes in separate scan paths.",
    dependencyPressure: "Dependency pressure",
    developerClosureCues: "Developer Closure Cues",
    developerModel: "Developer Model",
    directorCheckpoints: "Director checkpoints",
    directorReviewRail: "Director Review Rail",
    directorWorkspace: "Director workspace",
    evidenceLedger: "Evidence Ledger",
    evidenceLedgerLower: "Evidence ledger",
    filterTasks: "Filter Tasks",
    flowSummary:
      "A disciplined review surface for reading goal alignment, task pool pressure, rejected feedback, dependency risk, and the next human intervention.",
    goalStateReview: "Goal State Review",
    goalStateReviewDescription:
      "Current task pool, completed history, flow pressure, and rejected feedback are presented as one planning surface.",
    goalFit: "Goal fit",
    history: "History",
    historyResults: "History Results",
    humanAttention:
      "Human attention stays on goals, blockers, and clarification points. Dependency pressure and rejected feedback stay visible beside the ledger.",
    humanReviewNeeded: "Human review needed",
    interventionQueue: "Intervention Queue",
    interventionRail: "Intervention Rail",
    interventionRailAria: "Intervention rail",
    loadingConvergenceEvidence: "Loading convergence evidence.",
    evaluationSignals: "Evaluation signals",
    methodologyHub: "Methodology Hub",
    noActiveDashboardData:
      "No active Task Pool or completed task history available from the configured server. Check the server target or create the first AIM task when the baseline direction is ready.",
    noAimDimensionReport:
      "No AIM Dimensions are available for the current Task Pool project paths.",
    noDimensionEvaluation: "No dimension evaluation recorded yet.",
    noMatchingTasks: "No matching tasks.",
    noRejectedFeedbackMatches: "No rejected feedback matches filters.",
    noRejectedFeedbackRecorded: "No rejected feedback recorded yet.",
    noResultFeedbackRecorded: "No result feedback recorded",
    projectPath: "Project Path",
    refresh: "Refresh",
    rejectedFeedback: "Rejected feedback",
    rejectedFeedbackSignals: "Rejected Feedback Signals",
    rejectedFeedbackSignalsDescription:
      "Deduplicated failed task feedback for planning review only; historical task records stay unchanged.",
    recentActiveTasks: "Recent Active Tasks",
    reasonCategory: "Reason category",
    retry: "Retry",
    switchToEnglish: "Switch to English interface",
    switchToChinese: "Switch to Chinese interface",
    tableDependencies: "Dependencies",
    tableStatus: "Status",
    tableTask: "Task",
    taskDetails: "Task Details",
    taskId: "Task ID",
    taskIntake: "Task Intake",
    taskIntakeLower: "Task intake",
    taskPool: "Task Pool",
    taskPoolDecisionSignals: "Task Pool Decision Signals",
    taskPoolDecisionSignalsDescription:
      "Read-only signals derived from existing Task fields for coverage, progress, success, and blocker review.",
    taskSpec: "Task Spec",
    title: "Title",
    workspaceTarget: "Workspace Target",
    writeIntentReview: "Write intent review",
  },
  zh: {
    activeUnfinishedTasks: "活跃未完成任务",
    aimDimensionReport: "AIM Dimension 报告",
    aimDimensionReportAria: "AIM Dimension 报告",
    aimDimensionReportDescription:
      "维度评分先于任务机制呈现，让 Director 先看到目标匹配度。",
    aimNavigator: "AIM 导航",
    backToDashboard: "返回仪表盘",
    baselineConvergenceCockpit: "基线收敛驾驶舱",
    baselineConvergenceForDirector: "面向 AIM Director 的基线收敛",
    baselineConvergenceMap: "收敛图",
    baselineConvergenceMapRegion: "基线收敛图",
    baselineReview: "基线复核",
    beforeYouSend: "发送前检查",
    cancel: "取消",
    completedTaskFeedback: "已完成任务反馈",
    completedResultActivity: "已完成结果活动",
    coordinatorInput: "Coordinator 输入",
    createTask: "创建任务",
    createTaskDescription: "在同一个 Director 工作区中创建新的 AIM 任务。",
    createTaskFormSummary: "使用与收敛复核一致的证据语汇编写任务入口。",
    createTaskFormTitle: "先形成聚焦简报，再进入任务池。",
    creatingTask: "正在创建任务...",
    dashboardError: "仪表盘错误",
    dashboardStatus: "仪表盘状态",
    decisionObservability: "决策可观测性",
    evidenceLedgerDescription:
      "台账把活跃任务、Coordinator 反馈和已完成结果保持在独立扫描路径中。",
    dependencyPressure: "依赖压力",
    developerClosureCues: "开发闭环线索",
    developerModel: "开发模型",
    directorCheckpoints: "Director 检查点",
    directorReviewRail: "Director 复核栏",
    directorWorkspace: "Director 工作区",
    evidenceLedger: "证据台账",
    evidenceLedgerLower: "证据台账",
    filterTasks: "筛选任务",
    flowSummary:
      "用于阅读目标对齐、任务池压力、拒绝反馈、依赖风险和下一处人工介入点的严谨复核界面。",
    goalStateReview: "目标态复核",
    goalStateReviewDescription:
      "当前任务池、完成历史、流动压力和拒绝反馈作为一个规划界面呈现。",
    goalFit: "目标匹配度",
    history: "历史",
    historyResults: "历史结果",
    humanAttention:
      "人工注意力聚焦在目标、阻塞和澄清点上。依赖压力和拒绝反馈保持在台账旁可见。",
    humanReviewNeeded: "需要人工复核",
    interventionQueue: "介入队列",
    interventionRail: "介入栏",
    interventionRailAria: "介入栏",
    loadingConvergenceEvidence: "正在加载收敛证据。",
    evaluationSignals: "评估信号",
    methodologyHub: "方法论枢纽",
    noActiveDashboardData:
      "当前服务器没有活跃任务池或已完成任务历史。请检查服务器目标，或在基线方向就绪后创建第一个 AIM 任务。",
    noAimDimensionReport: "当前任务池项目路径没有 AIM Dimension。",
    noDimensionEvaluation: "尚无维度评估记录。",
    noMatchingTasks: "没有匹配的任务。",
    noRejectedFeedbackMatches: "没有符合筛选条件的拒绝反馈。",
    noRejectedFeedbackRecorded: "尚无拒绝反馈记录。",
    noResultFeedbackRecorded: "未记录结果反馈",
    projectPath: "项目路径",
    refresh: "刷新",
    rejectedFeedback: "拒绝反馈",
    rejectedFeedbackSignals: "拒绝反馈信号",
    rejectedFeedbackSignalsDescription:
      "去重后的失败任务反馈，仅用于规划复核；历史任务记录保持不变。",
    recentActiveTasks: "最近活跃任务",
    reasonCategory: "原因类别",
    retry: "重试",
    switchToEnglish: "切换到英文界面",
    switchToChinese: "切换到中文界面",
    tableDependencies: "依赖",
    tableStatus: "状态",
    tableTask: "任务",
    taskDetails: "任务详情",
    taskId: "任务 ID",
    taskIntake: "任务入口",
    taskIntakeLower: "任务入口",
    taskPool: "任务池",
    taskPoolDecisionSignals: "任务池决策信号",
    taskPoolDecisionSignalsDescription:
      "从现有任务字段派生的只读信号，用于覆盖率、进展、成功率和阻塞复核。",
    taskSpec: "任务规格",
    title: "标题",
    workspaceTarget: "工作区目标",
    writeIntentReview: "写入意图复核",
  },
} as const;

type MessageKey = keyof (typeof messages)["en"];

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  toggleLocale: () => void;
};

const I18nContext = createContext<I18nContextValue | null>(null);

const toSupportedLocale = (value: string | null | undefined): Locale | null => {
  if (!value) {
    return null;
  }

  return value.toLowerCase().startsWith("zh")
    ? "zh"
    : value === "en"
      ? "en"
      : null;
};

const resolveInitialLocale = (): Locale => {
  if (typeof window === "undefined") {
    return "en";
  }

  return (
    toSupportedLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY)) ??
    toSupportedLocale(window.navigator.language) ??
    "en"
  );
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [locale, setLocale] = useState<Locale>(resolveInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => messages[locale][key],
      toggleLocale: () => setLocale(locale === "zh" ? "en" : "zh"),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);

  if (!context) {
    throw new Error("useI18n must be used within I18nProvider");
  }

  return context;
};
