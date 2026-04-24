import {
  Card,
  Text,
  Title,
  useComputedColorScheme,
  useMantineTheme,
} from "@mantine/core";
import {
  Background,
  Controls,
  Handle,
  type NodeProps,
  Position,
  ReactFlow,
} from "reactflow";

import type {
  DashboardGraphEdge,
  DashboardGraphNode,
} from "../model/task-dashboard-adapter.js";
import { getDashboardThemeTokens } from "./dashboard-theme.js";

type TaskGraphNodeData = DashboardGraphNode["data"] & {
  backgroundColor: string;
  onSelect: () => void;
};

const formatStatusLabel = (status: TaskGraphNodeData["status"]) =>
  status.charAt(0).toUpperCase() + status.slice(1);

const TaskGraphNode = ({ data }: NodeProps<TaskGraphNodeData>) => (
  <>
    <Handle position={Position.Top} type="target" />
    <button
      className="nodrag nopan"
      data-testid={data.testId}
      onClick={data.onSelect}
      style={{
        background: data.backgroundColor,
        border: `2px solid ${data.color}`,
        borderRadius: 12,
        boxShadow: `0 14px 32px ${data.color}26`,
        color: "inherit",
        cursor: "pointer",
        minWidth: 180,
        padding: 12,
        pointerEvents: "all",
        textAlign: "left",
      }}
      type="button"
    >
      <strong>{data.label}</strong>
      <div>{formatStatusLabel(data.status)}</div>
    </button>
    <Handle position={Position.Bottom} type="source" />
  </>
);

const nodeTypes = {
  taskNode: TaskGraphNode,
};

export const DependencyGraphSection = ({
  graphEdges,
  graphNodes,
  onSelectTask,
}: {
  graphEdges: DashboardGraphEdge[];
  graphNodes: DashboardGraphNode[];
  onSelectTask: (taskId: string) => void;
}) => {
  const theme = useMantineTheme();
  const colorScheme = useComputedColorScheme("light");
  const tokens = getDashboardThemeTokens(theme, colorScheme);
  const nodes = graphNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      backgroundColor: tokens.panelBackground,
      onSelect: () => onSelectTask(node.id),
    },
    type: "taskNode" as const,
  }));
  const edges = graphEdges.map((edge) => ({
    ...edge,
    animated: true,
    style: { stroke: tokens.graphEdge, strokeWidth: 1.5 },
  }));

  return (
    <Card
      padding="lg"
      radius="xl"
      style={{
        backgroundColor: tokens.panelBackground,
        border: `1px solid ${tokens.panelBorder}`,
      }}
    >
      <Text c={tokens.mutedText} fw={700} size="xs" tt="uppercase">
        Dependency Graph
      </Text>
      <Title mb="md" order={3}>
        Dependency lanes
      </Title>
      <div
        style={{
          backgroundColor: tokens.graphCanvas,
          borderRadius: 18,
          height: 420,
          overflow: "hidden",
        }}
      >
        <ReactFlow
          edges={edges}
          elementsSelectable={false}
          fitView
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
        >
          <Background color={tokens.chartGrid} />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
};
