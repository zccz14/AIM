export type OptimizerLaneName = "coordinator" | "developer" | "manager";

export type OptimizerLaneEventKind =
  | "failure"
  | "idle"
  | "noop"
  | "start"
  | "success";

export type OptimizerLaneEventInput = {
  event: OptimizerLaneEventKind;
  lane_name: OptimizerLaneName;
  project_id: string;
  session_id?: string;
  summary: string;
  task_id?: string;
};

export type OptimizerLaneRecentEvent = OptimizerLaneEventInput & {
  timestamp: string;
};

const maxEventsPerLane = 5;

export const createOptimizerLaneEventRecorder = () => {
  const eventsByProjectLane = new Map<string, OptimizerLaneRecentEvent[]>();
  const keyFor = (projectId: string, laneName: OptimizerLaneName) =>
    `${projectId}:${laneName}`;

  return {
    list(projectId: string) {
      return [...eventsByProjectLane.entries()]
        .filter(([key]) => key.startsWith(`${projectId}:`))
        .flatMap(([, events]) => events)
        .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
    },
    record(input: OptimizerLaneEventInput) {
      const key = keyFor(input.project_id, input.lane_name);
      const next = [
        {
          ...input,
          timestamp: new Date().toISOString(),
        },
        ...(eventsByProjectLane.get(key) ?? []),
      ].slice(0, maxEventsPerLane);

      eventsByProjectLane.set(key, next);
    },
  };
};
