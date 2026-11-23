"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";

type FlattenChoices = {
  forms: boolean;
  annotations: boolean;
  stamps: boolean;
  keepLinks: boolean;
};

const DEFAULT_CHOICES: FlattenChoices = {
  forms: true,
  annotations: true,
  stamps: true,
  keepLinks: true,
};

export function useFlattenPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_flatten");
  const [choices, setChoices] = useState<FlattenChoices>(DEFAULT_CHOICES);
  const toggle = (key: keyof FlattenChoices) => (value: boolean) =>
    setChoices((current) => ({ ...current, [key]: value }));
  const chosen = [
    choices.forms ? t("summaryForms") : null,
    choices.annotations ? t("summaryAnnotations") : null,
    choices.stamps ? t("summaryStamps") : null,
  ].filter((item): item is string => item !== null);
  const nothing = chosen.length === 0;

  return {
    main: null,
    options: (
      <div className="flex flex-col gap-1" data-flatten-options>
        <p className="mb-1 text-sm font-medium">{t("legend")}</p>
        <ToggleRow
          id="flatten-forms"
          label={t("forms")}
          description={t("formsHint")}
          checked={choices.forms}
          onChange={toggle("forms")}
        />
        <ToggleRow
          id="flatten-annotations"
          label={t("annotations")}
          description={t("annotationsHint")}
          checked={choices.annotations}
          onChange={toggle("annotations")}
        />
        <ToggleRow
          id="flatten-stamps"
          label={t("stamps")}
          description={t("stampsHint")}
          checked={choices.stamps}
          onChange={toggle("stamps")}
        />
        <ToggleRow
          id="flatten-keep-links"
          label={t("keepLinks")}
          description={t("keepLinksHint")}
          checked={choices.keepLinks}
          onChange={toggle("keepLinks")}
        />
      </div>
    ),
    payload: {
      forms: choices.forms,
      annotations: choices.annotations,
      stamps: choices.stamps,
      keep_links: choices.keepLinks,
    },
    problem: nothing ? t("nothingSelected") : null,
    summary: nothing
      ? null
      : t("summary", { items: chosen.join(", "), count: Math.max(files.length, 1) }),
  };
}
