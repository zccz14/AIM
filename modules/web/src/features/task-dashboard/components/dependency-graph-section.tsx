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
      className="graph-node nodrag nopan"
      data-testid={data.testId}
      onClick={data.onSelect}
      style={{
        borderColor: data.color,
        pointerEvents: "all",
      }}
      type="button"
    >
      <strong>{data.label}</strong>
      <div className="graph-node__status">{formatStatusLabel(data.status)}</div>
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
    <section className="surface-card section-stack">
      <div>
        <p className="eyebrow">Task Pool Topology</p>
        <h2 className="section-title">Dependency Graph</h2>
      </div>
      <div className="graph-frame">
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
    </section>
  );
};
