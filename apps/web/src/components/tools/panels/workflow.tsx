"use client";

import type { Connection, Edge, Node, OnEdgesChange, OnNodesChange } from "@xyflow/react";
import dynamic from "next/dynamic";
import { Plus, Save, Trash2 } from "lucide-react";
import type React from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";

import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { NodeData } from "@/components/tools/panels/workflow-canvas";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { findTool } from "@/config/tools";
import { useAvailableTools, useSession } from "@/lib/session";
import { useTeamMutations, useTeams, useTeamWorkflows } from "@/lib/teams";
import { toast, toastError } from "@/components/ui/toaster";
import { toolText } from "@/lib/tool-text";
import {
  fanOutTooWide,
  findTemplate,
  hasCycle,
  INPUT_ID,
  layout,
  MAX_FANOUT,
  MAX_NODES,
  nextNodeId,
  WORKFLOW_TEMPLATES,
  type GraphEdge,
  type GraphNode,
} from "@/lib/workflow-graph";

type Position2D = { x: number; y: number };
type SavedWorkflow = {
  name: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  positions: Record<string, Position2D>;
};

const WorkflowCanvas = dynamic(() => import("@/components/tools/panels/workflow-canvas"), {
  ssr: false,
  loading: () => <div className="h-full animate-pulse bg-surface-muted" />,
});

const STORAGE_KEY = "pn.workflows";

function readSaved(): SavedWorkflow[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedWorkflow[]) : [];
  } catch {
    return [];
  }
}

function writeSaved(list: SavedWorkflow[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    return;
  }
}

export function useWorkflowPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("workflowBuilder");
  const toolT = useTranslations("tools");
  const params = useSearchParams();
  const available = useAvailableTools();
  const session = useSession();
  const teams = useTeams(Boolean(session.data));
  const [teamId, setTeamId] = useState<string | null>(params.get("team"));
  const teamWorkflows = useTeamWorkflows(teamId, Boolean(session.data));
  const teamMutations = useTeamMutations(teamId);
  const activeTeam = teams.data?.find((team) => team.id === teamId);
  const canWriteTeam = activeTeam ? activeTeam.role !== "viewer" : false;
  const [seed] = useState(() => findTemplate(params.get("template")));
  const [nodes, setNodes] = useState<GraphNode[]>(() => (seed ? structuredClone(seed.nodes) : []));
  const [edges, setEdges] = useState<GraphEdge[]>(() => (seed ? structuredClone(seed.edges) : []));
  const [positions, setPositions] = useState<Record<string, Position2D>>(() =>
    seed ? layout(seed.nodes, seed.edges) : {},
  );
  const [optionText, setOptionText] = useState<Record<string, string>>(() =>
    seed
      ? Object.fromEntries(
          seed.nodes.map((node) => [node.id, JSON.stringify(node.options, null, 2)]),
        )
      : {},
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedWorkflow[]>([]);
  const [saveName, setSaveName] = useState("");

  const loadGraph = useCallback(
    (graphNodes: GraphNode[], graphEdges: GraphEdge[], stored?: Record<string, Position2D>) => {
      setNodes(graphNodes);
      setEdges(graphEdges);
      setPositions(stored ?? layout(graphNodes, graphEdges));
      setOptionText(
        Object.fromEntries(
          graphNodes.map((node) => [node.id, JSON.stringify(node.options, null, 2)]),
        ),
      );
      setSelectedId(null);
    },
    [],
  );

  const titleOf = useCallback(
    (slug: string) => {
      const definition = findTool(slug);
      return definition ? toolText(toolT, definition).name : slug;
    },
    [toolT],
  );

  const eligible = useMemo(
    () => (available.data ?? []).filter((tool) => tool.workflow_step),
    [available.data],
  );
  const selected = nodes.find((node) => node.id === selectedId) ?? null;
  const selectedTool = selected ? eligible.find((tool) => tool.slug === selected.tool) : undefined;
  const schemaProperties = (selectedTool?.options_schema?.properties ?? {}) as Record<
    string,
    { type?: string }
  >;

  const roots = nodes.filter((node) => !edges.some((edge) => edge.target === node.id));
  const rfNodes: Node<NodeData>[] = [
    {
      id: INPUT_ID,
      type: "tool",
      position: { x: -230, y: 0 },
      data: { title: t("input"), slug: "", selected: false, input: true },
      deletable: false,
      draggable: false,
    },
    ...nodes.map((node) => ({
      id: node.id,
      type: "tool",
      position: positions[node.id] ?? { x: 0, y: 0 },
      data: { title: titleOf(node.tool), slug: node.tool, selected: node.id === selectedId },
    })),
  ];
  const rfEdges: Edge[] = [
    ...roots.map((root) => ({
      id: `input-${root.id}`,
      source: INPUT_ID,
      target: root.id,
      selectable: false,
      deletable: false,
      animated: true,
    })),
    ...edges.map((edge) => ({
      id: `${edge.source}->${edge.target}`,
      source: edge.source,
      target: edge.target,
    })),
  ];

  const onNodesChange: OnNodesChange<Node<NodeData>> = (changes) => {
    const moved = changes.applyTo(rfNodes);
    setPositions((current) => {
      const next = { ...current };
      for (const node of moved) if (node.id !== INPUT_ID) next[node.id] = node.position;
      return next;
    });
    const removed = changes
      .toArray()
      .filter((change) => change.type === "remove")
      .map((change) => change.id);
    if (removed.length) {
      setNodes((current) => current.filter((node) => !removed.includes(node.id)));
      setEdges((current) =>
        current.filter((edge) => !removed.includes(edge.source) && !removed.includes(edge.target)),
      );
      if (selectedId && removed.includes(selectedId)) setSelectedId(null);
    }
  };

  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target || connection.source === INPUT_ID) return;
    if (
      edges.some((edge) => edge.source === connection.source && edge.target === connection.target)
    )
      return;
    setEdges([...edges, { source: connection.source, target: connection.target }]);
  };

  const addNode = (slug: string) => {
    if (nodes.length >= MAX_NODES) return;
    const id = nextNodeId(nodes, slug);
    const parent = selected ?? nodes[nodes.length - 1] ?? null;
    const base = parent ? positions[parent.id] : undefined;
    const siblings = parent ? edges.filter((edge) => edge.source === parent.id).length : 0;
    setNodes([...nodes, { id, tool: slug, options: {} }]);
    setOptionText({ ...optionText, [id]: "{}" });
    setPositions({
      ...positions,
      [id]: base ? { x: base.x + 230, y: base.y + siblings * 110 } : { x: 0, y: 0 },
    });
    if (parent && siblings < MAX_FANOUT) setEdges([...edges, { source: parent.id, target: id }]);
    setSelectedId(id);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter((node) => node.id !== id));
    setEdges(edges.filter((edge) => edge.source !== id && edge.target !== id));
    setSelectedId(null);
  };

  const parsedOptions = (id: string): Record<string, unknown> | null => {
    const text = optionText[id];
    if (text === undefined || !text.trim()) return {};
    try {
      const value: unknown = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };

  const invalidJson = nodes.some((node) => parsedOptions(node.id) === null);
  const problem = !nodes.length
    ? t("problems.empty")
    : invalidJson
      ? t("problems.json")
      : hasCycle(nodes, edges)
        ? t("problems.cycle")
        : fanOutTooWide(edges)
          ? t("problems.fanout", { max: MAX_FANOUT })
          : null;

  const payload = {
    nodes: nodes.map((node) => ({
      id: node.id,
      tool: node.tool,
      options: parsedOptions(node.id) ?? {},
      label: node.label ?? "",
    })),
    edges,
  };

  const saveCurrent = () => {
    const name = saveName.trim();
    if (!name || !nodes.length) return;
    const record: SavedWorkflow = {
      name,
      nodes: payload.nodes.map(({ id, tool, options }) => ({ id, tool, options })),
      edges,
      positions,
    };
    const next = [...saved.filter((entry) => entry.name !== name), record];
    setSaved(next);
    writeSaved(next);
    setSaveName("");
  };

  const onEdgesChange: OnEdgesChange<Edge> = (changes) => {
    const removed = changes
      .toArray()
      .filter((change) => change.type === "remove")
      .map((change) => change.id);
    if (removed.length) {
      setEdges((current) =>
        current.filter((edge) => !removed.includes(`${edge.source}->${edge.target}`)),
      );
    }
  };

  const main = (
    <div
      className="h-[28rem] overflow-hidden rounded-(--radius-card) border border-border bg-surface"
      data-workflow-canvas
      style={
        {
          "--xy-background-color-default": "var(--color-surface)",
          "--xy-edge-stroke-default": "var(--color-muted)",
          "--xy-controls-button-background-color-default": "var(--color-surface)",
          "--xy-controls-button-color-default": "var(--color-foreground)",
        } as React.CSSProperties
      }
    >
      <WorkflowCanvas
        nodes={rfNodes}
        edges={rfEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={connect}
        onNodeClick={(id) => setSelectedId(id === INPUT_ID ? null : id)}
        onPaneClick={() => setSelectedId(null)}
      />
    </div>
  );

  const options = (
    <div className="flex flex-col gap-4" data-workflow-panel>
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("templates")}</h3>
        <div className="flex flex-wrap gap-1.5">
          {WORKFLOW_TEMPLATES.map((template) => (
            <button
              key={template.slug}
              type="button"
              data-workflow-template={template.slug}
              onClick={() => {
                loadGraph(structuredClone(template.nodes), structuredClone(template.edges));
              }}
              className="rounded-full border border-border px-3 py-1 text-xs hover:border-primary/50"
            >
              {t(`template.${template.slug}.name`)}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("addStep")}</h3>
        <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
          {eligible.map((tool) => (
            <button
              key={tool.slug}
              type="button"
              data-workflow-add={tool.slug}
              disabled={nodes.length >= MAX_NODES}
              onClick={() => addNode(tool.slug)}
              className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs hover:border-primary/50 disabled:opacity-50"
            >
              <Plus className="size-3" aria-hidden />
              {titleOf(tool.slug)}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">{t("canvasHint", { max: MAX_NODES })}</p>
      </section>

      {selected ? (
        <fieldset
          className="flex flex-col gap-2 rounded-xl border border-border p-3"
          data-workflow-selected
        >
          <legend className="px-1 text-sm font-medium">{titleOf(selected.tool)}</legend>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("optionsJson")}
            <textarea
              rows={5}
              spellCheck={false}
              value={optionText[selected.id] ?? "{}"}
              onChange={(event) => {
                setOptionText({ ...optionText, [selected.id]: event.target.value });
                try {
                  const value: unknown = JSON.parse(event.target.value || "{}");
                  if (value && typeof value === "object" && !Array.isArray(value)) {
                    setNodes(
                      nodes.map((node) =>
                        node.id === selected.id
                          ? { ...node, options: value as Record<string, unknown> }
                          : node,
                      ),
                    );
                  }
                } catch {
                  return;
                }
              }}
              className="rounded-md border border-border bg-surface p-2 font-mono text-xs"
              dir="ltr"
              aria-invalid={parsedOptions(selected.id) === null}
            />
          </label>
          {Object.keys(schemaProperties).length ? (
            <p className="text-xs text-muted" dir="ltr">
              {Object.entries(schemaProperties)
                .map(([name, schema]) => `${name}${schema.type ? ` (${schema.type})` : ""}`)
                .join(", ")}
            </p>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("outputLabel")}
            <Input
              value={selected.label ?? ""}
              maxLength={40}
              onChange={(event) =>
                setNodes(
                  nodes.map((node) =>
                    node.id === selected.id ? { ...node, label: event.target.value } : node,
                  ),
                )
              }
            />
          </label>
          <Button type="button" size="sm" variant="outline" onClick={() => removeNode(selected.id)}>
            <Trash2 aria-hidden />
            {t("removeStep")}
          </Button>
        </fieldset>
      ) : null}

      {session.data && (teams.data?.length ?? 0) > 0 ? (
        <section className="flex flex-col gap-2" data-workflow-team>
          <h3 className="text-sm font-medium">{t("teamWorkflows")}</h3>
          <Select
            value={teamId ?? ""}
            onChange={(event) => setTeamId(event.target.value || null)}
            aria-label={t("team")}
          >
            <option value="">{t("chooseTeam")}</option>
            {(teams.data ?? []).map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </Select>
          {teamId ? (
            <>
              {(teamWorkflows.data ?? []).map((workflow) => (
                <button
                  key={workflow.id}
                  type="button"
                  className="truncate text-start text-sm text-primary underline"
                  onClick={() => loadGraph(workflow.graph.nodes, workflow.graph.edges)}
                >
                  {workflow.name}
                </button>
              ))}
              {canWriteTeam ? (
                <Button
                  icon={<Save />}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!saveName.trim() || !nodes.length || problem !== null}
                  loading={teamMutations.saveWorkflow.isPending}
                  onClick={() =>
                    teamMutations.saveWorkflow.mutate(
                      {
                        name: saveName.trim(),
                        nodes: payload.nodes.map(({ id, tool, options }) => ({
                          id,
                          tool,
                          options,
                        })),
                        edges,
                      },
                      {
                        onSuccess: () => toast.success(t("savedToTeam")),
                        onError: toastError,
                      },
                    )
                  }
                >
                  {t("saveToTeam")}
                </Button>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <details
        className="flex flex-col gap-2"
        onToggle={(event) => {
          if (event.currentTarget.open) setSaved(readSaved());
        }}
      >
        <summary className="cursor-pointer text-sm font-medium">{t("myWorkflows")}</summary>
        <div className="flex gap-2">
          <Input
            value={saveName}
            onChange={(event) => setSaveName(event.target.value)}
            placeholder={t("saveName")}
            aria-label={t("saveName")}
            maxLength={60}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={saveCurrent}
            disabled={!saveName.trim() || !nodes.length}
          >
            <Save aria-hidden />
            {t("save")}
          </Button>
        </div>
        {saved.map((entry) => (
          <div key={entry.name} className="flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              className="truncate text-start text-primary underline"
              onClick={() => loadGraph(entry.nodes, entry.edges, entry.positions)}
            >
              {entry.name}
            </button>
            <button
              type="button"
              aria-label={t("delete")}
              className="text-muted hover:text-danger-strong"
              onClick={() => {
                const next = saved.filter((item) => item.name !== entry.name);
                setSaved(next);
                writeSaved(next);
              }}
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        ))}
      </details>
    </div>
  );

  return {
    main,
    options,
    payload,
    problem,
    summary:
      nodes.length && !problem && files.length
        ? t("summary", {
            steps: nodes.length,
            outputs: nodes.filter((node) => !edges.some((edge) => edge.source === node.id)).length,
          })
        : null,
  };
}
