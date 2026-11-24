import templatesJson from "@/config/workflow-templates.generated.json";

export type GraphNode = {
  id: string;
  tool: string;
  options: Record<string, unknown>;
  label?: string;
};
export type GraphEdge = { source: string; target: string };
export type WorkflowTemplate = { slug: string; nodes: GraphNode[]; edges: GraphEdge[] };

export const WORKFLOW_TEMPLATES = templatesJson as WorkflowTemplate[];
export const MAX_NODES = 12;
export const MAX_FANOUT = 4;
export const INPUT_ID = "__input";

export function findTemplate(slug: string | null): WorkflowTemplate | undefined {
  return slug ? WORKFLOW_TEMPLATES.find((template) => template.slug === slug) : undefined;
}

export function nextNodeId(existing: GraphNode[], tool: string): string {
  const base = tool.replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "step";
  const taken = new Set(existing.map((node) => node.id));
  let candidate = base.replace(/^[^A-Za-z]/, "s");
  let counter = 1;
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `${base}${counter}`;
  }
  return candidate;
}

export function hasCycle(nodes: GraphNode[], edges: GraphEdge[]): boolean {
  const indegree = new Map(nodes.map((node) => [node.id, 0]));
  const children = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    if (!indegree.has(edge.source) || !indegree.has(edge.target)) continue;
    children.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }
  const ready = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (ready.length) {
    const current = ready.pop() as string;
    visited += 1;
    for (const target of children.get(current) ?? []) {
      const remaining = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, remaining);
      if (remaining === 0) ready.push(target);
    }
  }
  return visited !== nodes.length;
}

export function fanOutTooWide(edges: GraphEdge[]): boolean {
  const counts = new Map<string, number>();
  for (const edge of edges) counts.set(edge.source, (counts.get(edge.source) ?? 0) + 1);
  return [...counts.values()].some((count) => count > MAX_FANOUT);
}

export function layout(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Record<string, { x: number; y: number }> {
  const depth = new Map<string, number>();
  const parents = new Map<string, string[]>(nodes.map((node) => [node.id, []]));
  for (const edge of edges) parents.get(edge.target)?.push(edge.source);
  const resolveDepth = (id: string, guard = 0): number => {
    if (depth.has(id)) return depth.get(id) as number;
    if (guard > nodes.length) return 0;
    const sources = parents.get(id) ?? [];
    const value = sources.length
      ? Math.max(...sources.map((source) => resolveDepth(source, guard + 1))) + 1
      : 1;
    depth.set(id, value);
    return value;
  };
  const rows = new Map<number, number>();
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const column = resolveDepth(node.id);
    const row = rows.get(column) ?? 0;
    rows.set(column, row + 1);
    positions[node.id] = { x: column * 230, y: row * 110 };
  }
  return positions;
}
