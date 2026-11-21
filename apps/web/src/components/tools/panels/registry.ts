import type { ReactNode } from "react";

import { usePageTool } from "@/components/tools/page-tools";
import type { LocalFile } from "@/components/tools/use-tool-session";

export type ToolPanelView = {
  main: ReactNode;
  options: ReactNode;
  payload: Record<string, unknown>;
  problem: string | null;
  summary: string | null;
};

export type ToolPanelHook = (files: LocalFile[]) => ToolPanelView;

function useRotatePanel(files: LocalFile[]): ToolPanelView {
  return usePageTool("rotate", files);
}

function useRemovePagesPanel(files: LocalFile[]): ToolPanelView {
  return usePageTool("remove-pages", files);
}

function useExtractPagesPanel(files: LocalFile[]): ToolPanelView {
  return usePageTool("extract-pages", files);
}

function useSplitPanel(files: LocalFile[]): ToolPanelView {
  return usePageTool("split", files);
}

function useOrganizePanel(files: LocalFile[]): ToolPanelView {
  return usePageTool("organize", files);
}

export function useNoPanel(): null {
  return null;
}

export const TOOL_PANELS: Record<string, ToolPanelHook> = {
  rotate: useRotatePanel,
  "remove-pages": useRemovePagesPanel,
  "extract-pages": useExtractPagesPanel,
  split: useSplitPanel,
  organize: useOrganizePanel,
};
