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
    aimIcon: "AIM icon",
    aimNavigator: "AIM Navigator",
    aimSections: "AIM sections",
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
    completedStatus: "Completed",
    checklistFacts: "Checklist Facts",
    connection: "Connection",
    contractStatus: "Contract Status",
    coordinatorInput: "Coordinator Input",
    createTask: "Create Task",
    createProject: "Create Project",
    createTaskDescription:
      "Create a new AIM task from the same Director workspace used for convergence review.",
    createTaskFormSummary:
      "Draft task intake beside the same evidence vocabulary used for convergence review.",
    createTaskFormTitle:
      "Shape a focused brief before it enters the task pool.",
    creatingTask: "Creating Task...",
    createdAt: "Created At",
    dashboard: "Dashboard",
    dashboardError: "Dashboard Error",
    dashboardOverview: "Dashboard Overview",
    dashboardSimpleDescription:
      "Multi-project observability and global settings stay at the top level. Project task pressure and dimension fit stay visible without history or write-intent noise.",
    dashboardStatus: "Dashboard Status",
    decisionObservability: "Decision Observability",
    evidenceLedgerDescription:
      "The ledger keeps active tasks, Coordinator feedback, and completed outcomes in separate scan paths.",
    dependencyPressure: "Dependency pressure",
    dependencyLinkedTask: "dependency-linked task",
    dependenciesNone: "Dependencies: None",
    developerClosureCues: "Developer Closure Cues",
    developerModel: "Developer Model",
    dimensionDetail: "Dimension Detail",
    dimensionNotFound: "Dimension not found.",
    dimensions: "Dimensions",
    dimensionSingular: "dimension",
    dimensionScoreTrend: "score trend",
    dimensionScoreTrendChart: "score trend chart",
    dimensionUnavailableDescription:
      "Return to the cockpit and select an available dimension report.",
    dimensionEvaluationDescription:
      "The score trend will appear after AIM records evaluation evidence.",
    directorCheckpoints: "Director checkpoints",
    directorReviewRail: "Director Review Rail",
    directorWorkspace: "Director workspace",
    evidenceLedger: "Evidence Ledger",
    evidenceLedgerLower: "Evidence ledger",
    filterTasks: "Filter Tasks",
    flowSummary:
      "Multi-project observability and global settings. Project-scoped task pressure and dimension fit stay simple.",
    globalControls: "Global controls",
    globalModel: "Global Model",
    globalProvider: "Global Provider",
    gitOriginUrl: "Git Origin URL",
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
    latestScore: "Latest score",
    loadingConvergenceEvidence: "Loading convergence evidence.",
    loadingTaskDashboard: "Loading task dashboard",
    evaluationSignals: "Evaluation signals",
    edit: "Edit",
    editProject: "Edit Project",
    editing: "Editing",
    delete: "Delete",
    deliveryContext: "Delivery Context",
    methodologyHub: "Methodology Hub",
    method: "Method",
    noActiveDashboardData:
      "No active Task Pool or completed task history available from the configured server. Check the server target or create the first AIM task when the baseline direction is ready.",
    noAimDimensionReport:
      "No AIM Dimensions are available for the current Task Pool projects.",
    noDimensionEvaluation: "No dimension evaluation recorded yet.",
    noDimensionsForProject: "No dimensions registered for this project.",
    noMatchingTasks: "No matching tasks.",
    none: "None",
    noProjectsYet: "No Projects Yet",
    noProjectsYetDescription:
      "Create the first project so tasks can use a stable path and global model configuration.",
    noRegisteredProjects: "No registered projects available.",
    noScore: "No score",
    open: "Open",
    openPullRequest: "Open Pull Request",
    optimizer: "Optimizer",
    enabled: "Enabled",
    disabled: "Disabled",
    panelUnavailable: "Panel unavailable",
    panelFailedToRender: "failed to render.",
    directCause: "Direct cause",
    executionMetadata: "Execution Metadata",
    projectChangesDescription:
      "Project changes update the register, not existing task history.",
    projectCrudDescription:
      "Project CRUD keeps task intake anchored to explicit repositories and global model defaults before autonomous work starts.",
    projectDetail: "Project Detail",
    projectDimensions: "Project Dimensions",
    projectDimensionsDescription:
      "Dimension fit is scoped to this project ID only.",
    projectDimensionsRegion: "Project dimensions",
    projectHealth: "Project Health",
    projectHealthDescription:
      "Project-level scan target for dimensions and task pool pressure.",
    projectId: "Project ID",
    projectName: "Project Name",
    projectNotAvailable: "Project not available",
    projectNotAvailableDescription:
      "Refresh projects before opening project-scoped observability.",
    projectObservability: "Project observability",
    projectOptimizer: "Project Optimizer",
    projectOptimizerBlocker: "Blocker",
    projectOptimizerConfig: "Config",
    projectOptimizerConfigDisabled: "Config disabled",
    projectOptimizerConfigEnabled: "Config enabled",
    projectOptimizerDescription:
      "Persist whether this project should start AIM optimizer lanes.",
    projectOptimizerRecentEvent: "Recent event",
    projectOptimizerRecentScan: "Recent scan",
    projectOptimizerRuntime: "Runtime",
    projectOptimizerRuntimeActive: "Runtime active",
    projectOptimizerRuntimeDescription:
      "Project config and runtime activity are reported separately.",
    projectOptimizerRuntimeInactive: "Runtime inactive",
    projectOptimizerRuntimeRegion: "Project optimizer runtime",
    projectOptimizerRuntimeTitle: "Project Optimizer Runtime",
    projectOptimizerRuntimeUnknown: "Runtime unknown",
    projectOptimizerTriggers: "Triggers",
    projectRegister: "Project Register",
    projectRequestBlocked: "Project request blocked",
    projectRequestFailed: "Project request failed",
    projects: "Projects",
    projectSingular: "Project",
    pointAimNavigator:
      "Point AIM Navigator at the API instance you want to inspect.",
    pullRequestNone: "Pull Request: None",
    refreshForEvidence:
      "Refresh the configured server to collect convergence evidence.",
    noRejectedFeedbackMatches: "No rejected feedback matches filters.",
    noRejectedFeedbackRecorded: "No rejected feedback recorded yet.",
    noResultFeedbackRecorded: "No result feedback recorded",
    refresh: "Refresh",
    retryPanel: "Retry panel",
    retryPanelDescription:
      "Retry this panel after refreshing the dashboard evidence. Other Director cockpit sections remain available.",
    rejectedFeedback: "Rejected feedback",
    rejectedFeedbackSignals: "Rejected Feedback Signals",
    rejectedFeedbackSignalsDescription:
      "Deduplicated failed task feedback for planning review only; historical task records stay unchanged.",
    recentActiveTasks: "Recent Active Tasks",
    reasonCategory: "Reason category",
    save: "Save",
    saved: "Saved",
    saveProject: "Save Project",
    score: "Score",
    scoreTrend: "Score Trend",
    scoreTrendDescription: "Time on X axis, score on Y axis",
    serverBaseUrl: "Server Base URL",
    sessionId: "Session ID",
    retry: "Retry",
    taskNotFound: "Task not found",
    taskNotFoundDescription:
      "The requested task is not available from the current dashboard data.",
    taskOverview: "Task Overview",
    taskOverviewDescription:
      "Review the task brief, delivery metadata, dependencies, and closure cues without dropping out of the Director cockpit.",
    taskRelationships: "Task Relationships",
    taskSingular: "active task",
    completedTaskSingular: "completed task",
    time: "Time",
    topLevelDashboard: "Top-Level Dashboard",
    updatedAt: "Updated At",
    worktree: "Worktree",
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
    useGitOriginUrlDescription:
      "Use the repository origin URL that identifies this project.",
    workspaceTarget: "Workspace Target",
    writeIntentReview: "Write intent review",
  },
  zh: {
    activeUnfinishedTasks: "活跃未完成任务",
    aimDimensionReport: "AIM Dimension 报告",
    aimDimensionReportAria: "AIM Dimension 报告",
    aimDimensionReportDescription:
      "维度评分先于任务机制呈现，让 Director 先看到目标匹配度。",
    aimIcon: "AIM 图标",
    aimNavigator: "AIM 导航",
    aimSections: "AIM 分区",
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
    completedStatus: "已完成",
    checklistFacts: "检查清单事实",
    connection: "连接",
    contractStatus: "契约状态",
    coordinatorInput: "Coordinator 输入",
    createTask: "创建任务",
    createProject: "创建项目",
    createTaskDescription: "在同一个 Director 工作区中创建新的 AIM 任务。",
    createTaskFormSummary: "使用与收敛复核一致的证据语汇编写任务入口。",
    createTaskFormTitle: "先形成聚焦简报，再进入任务池。",
    creatingTask: "正在创建任务...",
    createdAt: "创建时间",
    dashboard: "仪表盘",
    dashboardError: "仪表盘错误",
    dashboardOverview: "仪表盘概览",
    dashboardSimpleDescription:
      "顶层只保留多项目可观测性和全局设置。项目任务压力与 Dimension 匹配度保持可见，不混入历史或写入意图噪声。",
    dashboardStatus: "仪表盘状态",
    decisionObservability: "决策可观测性",
    evidenceLedgerDescription:
      "台账把活跃任务、Coordinator 反馈和已完成结果保持在独立扫描路径中。",
    dependencyPressure: "依赖压力",
    dependencyLinkedTask: "个依赖关联任务",
    dependenciesNone: "依赖：无",
    developerClosureCues: "开发闭环线索",
    developerModel: "开发模型",
    dimensionDetail: "Dimension 详情",
    dimensionNotFound: "未找到 Dimension。",
    dimensions: "Dimensions",
    dimensionSingular: "个维度",
    dimensionScoreTrend: "评分趋势",
    dimensionScoreTrendChart: "评分趋势图",
    dimensionUnavailableDescription: "返回驾驶舱并选择可用的 Dimension 报告。",
    dimensionEvaluationDescription: "AIM 记录评估证据后会显示评分趋势。",
    directorCheckpoints: "Director 检查点",
    directorReviewRail: "Director 复核栏",
    directorWorkspace: "Director 工作区",
    evidenceLedger: "证据台账",
    evidenceLedgerLower: "证据台账",
    filterTasks: "筛选任务",
    flowSummary:
      "多项目可观测性与全局设置。项目内任务压力和 Dimension 匹配度保持简洁。",
    globalControls: "全局控件",
    globalModel: "全局模型",
    globalProvider: "全局 Provider",
    gitOriginUrl: "Git Origin URL",
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
    latestScore: "最新评分",
    loadingConvergenceEvidence: "正在加载收敛证据。",
    loadingTaskDashboard: "正在加载任务仪表盘",
    evaluationSignals: "评估信号",
    edit: "编辑",
    editProject: "编辑项目",
    editing: "编辑中",
    delete: "删除",
    deliveryContext: "交付上下文",
    methodologyHub: "方法论枢纽",
    method: "方法",
    noActiveDashboardData:
      "当前服务器没有活跃任务池或已完成任务历史。请检查服务器目标，或在基线方向就绪后创建第一个 AIM 任务。",
    noAimDimensionReport: "当前任务池项目没有 AIM Dimension。",
    noDimensionEvaluation: "尚无维度评估记录。",
    noDimensionsForProject: "此项目尚未注册 Dimension。",
    noMatchingTasks: "没有匹配的任务。",
    none: "无",
    noProjectsYet: "尚无项目",
    noProjectsYetDescription:
      "创建第一个项目，让任务使用稳定路径和全局模型配置。",
    noRegisteredProjects: "没有可用的注册项目。",
    noScore: "无评分",
    open: "打开",
    openPullRequest: "打开 Pull Request",
    optimizer: "Optimizer",
    enabled: "已启用",
    disabled: "已禁用",
    panelUnavailable: "面板不可用",
    panelFailedToRender: "渲染失败。",
    directCause: "直接原因",
    executionMetadata: "执行元数据",
    projectChangesDescription: "项目变更会更新注册表，不改变既有任务历史。",
    projectCrudDescription:
      "项目 CRUD 让任务入口先锚定明确仓库和全局模型默认值，再开始自治工作。",
    projectDetail: "项目详情",
    projectDimensions: "项目 Dimensions",
    projectDimensionsDescription: "Dimension 匹配度仅限定在此项目 ID。",
    projectDimensionsRegion: "项目 Dimensions",
    projectHealth: "项目健康度",
    projectHealthDescription: "面向 Dimensions 和任务池压力的项目级扫描目标。",
    projectId: "项目 ID",
    projectName: "项目名称",
    projectNotAvailable: "项目不可用",
    projectNotAvailableDescription: "打开项目级可观测性前请刷新项目。",
    projectObservability: "项目可观测性",
    projectOptimizer: "项目 Optimizer",
    projectOptimizerBlocker: "阻塞",
    projectOptimizerConfig: "配置",
    projectOptimizerConfigDisabled: "配置未启用",
    projectOptimizerConfigEnabled: "配置已启用",
    projectOptimizerDescription: "持久化此项目是否应启动 AIM optimizer lanes。",
    projectOptimizerRecentEvent: "最近事件",
    projectOptimizerRecentScan: "最近扫描",
    projectOptimizerRuntime: "运行态",
    projectOptimizerRuntimeActive: "运行态活跃",
    projectOptimizerRuntimeDescription: "项目配置和运行态活动会分开展示。",
    projectOptimizerRuntimeInactive: "运行态未活跃",
    projectOptimizerRuntimeRegion: "项目 optimizer 运行态",
    projectOptimizerRuntimeTitle: "项目 Optimizer 运行态",
    projectOptimizerRuntimeUnknown: "运行态未知",
    projectOptimizerTriggers: "触发源",
    projectRegister: "项目注册表",
    projectRequestBlocked: "项目请求被阻止",
    projectRequestFailed: "项目请求失败",
    projects: "项目",
    projectSingular: "项目",
    pointAimNavigator: "将 AIM 导航指向要检查的 API 实例。",
    pullRequestNone: "Pull Request：无",
    refreshForEvidence: "刷新已配置服务器以收集收敛证据。",
    noRejectedFeedbackMatches: "没有符合筛选条件的拒绝反馈。",
    noRejectedFeedbackRecorded: "尚无拒绝反馈记录。",
    noResultFeedbackRecorded: "未记录结果反馈",
    refresh: "刷新",
    retryPanel: "重试面板",
    retryPanelDescription:
      "刷新仪表盘证据后重试此面板。其他 Director 驾驶舱分区仍可使用。",
    rejectedFeedback: "拒绝反馈",
    rejectedFeedbackSignals: "拒绝反馈信号",
    rejectedFeedbackSignalsDescription:
      "去重后的失败任务反馈，仅用于规划复核；历史任务记录保持不变。",
    recentActiveTasks: "最近活跃任务",
    reasonCategory: "原因类别",
    save: "保存",
    saved: "已保存",
    saveProject: "保存项目",
    score: "评分",
    scoreTrend: "评分趋势",
    scoreTrendDescription: "X 轴为时间，Y 轴为评分",
    serverBaseUrl: "服务器基础 URL",
    sessionId: "会话 ID",
    retry: "重试",
    taskNotFound: "未找到任务",
    taskNotFoundDescription: "请求的任务不在当前仪表盘数据中。",
    taskOverview: "任务概览",
    taskOverviewDescription:
      "在不离开 Director 驾驶舱的情况下复核任务简报、交付元数据、依赖和闭环线索。",
    taskRelationships: "任务关系",
    taskSingular: "个活跃任务",
    completedTaskSingular: "个已完成任务",
    time: "时间",
    topLevelDashboard: "顶层仪表盘",
    updatedAt: "更新时间",
    worktree: "Worktree",
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
    useGitOriginUrlDescription: "使用标识此项目的仓库 origin URL。",
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
