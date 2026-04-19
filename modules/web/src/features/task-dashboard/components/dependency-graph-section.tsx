import { Card, Title } from "@mantine/core";
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

type TaskGraphNodeData = DashboardGraphNode["data"] & {
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
        background: "white",
        border: `2px solid ${data.color}`,
        borderRadius: 12,
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
  const nodes = graphNodes.map((node) => ({
    ...node,
    data: {
      ...node.data,
      onSelect: () => onSelectTask(node.id),
    },
    type: "taskNode" as const,
  }));

  return (
    <Card withBorder>
      <Title mb="md" order={3}>
        Dependency Graph
      </Title>
      <div style={{ height: 420 }}>
        <ReactFlow
          edges={graphEdges}
          elementsSelectable={false}
          fitView
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={false}
          nodeTypes={nodeTypes}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
    </Card>
  );
};
