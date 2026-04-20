import type { TaskSessionState } from "./task-session-coordinator.js";

type SessionMessageRecord = {
  info?: {
    finish?: unknown;
    role?: unknown;
    time?: {
      created?: unknown;
      completed?: unknown;
    };
  };
  parts?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isTerminalToolState = (status: unknown) =>
  status === "completed" || status === "error";

type ChronologicalDirection = "ascending" | "descending";
type ChronologicalDirectionResult = ChronologicalDirection | "contradictory";

const getCreatedTime = (record: SessionMessageRecord): number | undefined => {
  const created = record.info?.time?.created;

  return typeof created === "number" && Number.isFinite(created)
    ? created
    : undefined;
};

const getChronologicalDirection = (
  records: SessionMessageRecord[],
): ChronologicalDirectionResult | undefined => {
  let direction: ChronologicalDirection | undefined;
  let previousCreated: number | undefined;

  for (const record of records) {
    const created = getCreatedTime(record);

    if (created === undefined) {
      continue;
    }

    if (previousCreated === undefined) {
      previousCreated = created;
      continue;
    }

    if (created === previousCreated) {
      return undefined;
    }

    const nextDirection =
      created > previousCreated ? "ascending" : "descending";

    if (direction && direction !== nextDirection) {
      return "contradictory";
    }

    direction = nextDirection;
    previousCreated = created;
  }

  return direction;
};

const getTerminalAssistantRecord = (
  assistantRecords: SessionMessageRecord[],
): SessionMessageRecord | undefined => {
  if (assistantRecords.length === 0) {
    return undefined;
  }

  const direction = getChronologicalDirection(assistantRecords);

  if (direction === "contradictory") {
    return undefined;
  }

  if (direction === "descending") {
    return assistantRecords[0];
  }

  return assistantRecords[assistantRecords.length - 1];
};

const hasExplicitAssistantCompletion = (record: SessionMessageRecord) => {
  const completed = record.info?.time?.completed;

  if (!Array.isArray(record.parts)) {
    return false;
  }

  const parts = record.parts;
  const hasFinish =
    typeof record.info?.finish === "string" && record.info.finish.length > 0;
  const hasStepFinish = parts.some(
    (part) => isRecord(part) && part.type === "step-finish",
  );
  const hasRunningTool = parts.some(
    (part) =>
      isRecord(part) &&
      part.type === "tool" &&
      (!isRecord(part.state) || !isTerminalToolState(part.state.status)),
  );

  return (
    Number.isFinite(completed) &&
    (hasFinish || hasStepFinish) &&
    !hasRunningTool
  );
};

export const classifySessionMessageState = (
  records: unknown,
): TaskSessionState => {
  if (!Array.isArray(records)) {
    return "running";
  }

  const assistantRecords = records.filter(
    (record): record is SessionMessageRecord =>
      isRecord(record) &&
      isRecord(record.info) &&
      record.info.role === "assistant",
  );

  if (assistantRecords.length === 0) {
    return "running";
  }

  const assistantRecord = getTerminalAssistantRecord(assistantRecords);

  if (!assistantRecord) {
    return "running";
  }

  return hasExplicitAssistantCompletion(assistantRecord) ? "idle" : "running";
};
