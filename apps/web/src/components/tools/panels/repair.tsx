"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";

export function useRepairPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_repair");
  const [rasterize, setRasterize] = useState(false);

  const options = (
    <div className="flex flex-col gap-3" data-repair-options>
      <p className="text-sm text-muted">{t("explanation")}</p>
      <ol className="flex list-decimal flex-col gap-1 ps-5 text-sm text-muted">
        <li>{t("stepStructure")}</li>
        <li>{t("stepObjects")}</li>
        <li>{t("stepPages")}</li>
      </ol>
      <ToggleRow
        id="repair-rasterize"
        label={t("rasterize")}
        description={t("rasterizeHint")}
        checked={rasterize}
        onChange={setRasterize}
      />
      <p className="text-xs text-muted">{t("reportNote")}</p>
    </div>
  );

  return {
    main: null,
    options,
    payload: { rasterize_unreadable_pages: rasterize },
    problem: null,
    summary: files.length > 0 ? t("summary") : null,
  };
}
