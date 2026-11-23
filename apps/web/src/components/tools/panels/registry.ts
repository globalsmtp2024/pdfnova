import type { ReactNode } from "react";

import { usePageTool } from "@/components/tools/page-tools";
import { useCompressPanel } from "@/components/tools/panels/compress";
import { useRepairPanel } from "@/components/tools/panels/repair";
import { usePageNumbersPanel } from "@/components/tools/panels/page-numbers";
import { useWatermarkPanel } from "@/components/tools/panels/watermark";
import { useCropPanel } from "@/components/tools/panels/crop";
import { useProtectPanel } from "@/components/tools/panels/protect";
import { useUnlockPanel } from "@/components/tools/panels/unlock";
import { useFlattenPanel } from "@/components/tools/panels/flatten";
import { useMetadataPanel } from "@/components/tools/panels/metadata";
import { useMergePanel } from "@/components/tools/panels/merge";
import { useSignPanel } from "@/components/tools/panels/sign";
import { useSchemaPanel } from "@/components/tools/panels/schema";
import type { LocalFile } from "@/components/tools/use-tool-session";

export type ToolPanelView = {
  main: ReactNode;
  options: ReactNode;
  payload: Record<string, unknown>;
  problem: string | null;
  summary: string | null;
  secrets?: Record<string, string>;
  clearSecrets?: () => void;
  renderFileExtras?: (file: LocalFile) => ReactNode;
};

export type ToolPanelHook = (files: LocalFile[], schema?: Record<string, unknown>) => ToolPanelView;

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

export const FALLBACK_PANEL: ToolPanelHook = useSchemaPanel;

export const TOOL_PANELS: Record<string, ToolPanelHook> = {
  rotate: useRotatePanel,
  "remove-pages": useRemovePagesPanel,
  "extract-pages": useExtractPagesPanel,
  split: useSplitPanel,
  organize: useOrganizePanel,
  compress: useCompressPanel,
  repair: useRepairPanel,
  "page-numbers": usePageNumbersPanel,
  watermark: useWatermarkPanel,
  crop: useCropPanel,
  protect: useProtectPanel,
  unlock: useUnlockPanel,
  flatten: useFlattenPanel,
  "edit-metadata": useMetadataPanel,
  merge: useMergePanel,
  sign: useSignPanel,
};
