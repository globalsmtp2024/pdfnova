"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type OnEdgesChange,
  type OnNodesChange,
} from "@xyflow/react";
import { FileInput } from "lucide-react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { cn } from "@/lib/utils";

export type NodeData = { title: string; slug: string; selected: boolean; input?: boolean };

function ToolNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div
      className={cn(
        "flex min-w-44 items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-sm shadow-soft",
        data.selected ? "border-primary ring-2 ring-primary/40" : "border-border",
      )}
    >
      <Handle type="target" position={Position.Left} />
      {data.input ? (
        <FileInput className="size-5 text-primary" aria-hidden />
      ) : (
        <ToolIcon slug={data.slug} size="sm" />
      )}
      <span className="font-medium">{data.title}</span>
      {data.input ? null : <Handle type="source" position={Position.Right} />}
      {data.input ? <Handle type="source" position={Position.Right} /> : null}
    </div>
  );
}

const NODE_TYPES = { tool: ToolNode };

export default function WorkflowCanvas({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onPaneClick,
}: {
  nodes: Node<NodeData>[];
  edges: Edge[];
  onNodesChange: OnNodesChange<Node<NodeData>>;
  onEdgesChange: OnEdgesChange<Edge>;
  onConnect: (connection: Connection) => void;
  onNodeClick: (id: string) => void;
  onPaneClick: () => void;
}) {
  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={(_, node) => onNodeClick(node.id)}
      onPaneClick={onPaneClick}
      fitView
      deleteKeyCode={["Delete", "Backspace"]}
      proOptions={{ hideAttribution: true }}
    >
      <Background />
      <Controls showInteractive={false} />
    </ReactFlow>
  );
}
