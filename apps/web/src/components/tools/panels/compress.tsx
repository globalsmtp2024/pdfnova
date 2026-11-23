"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { create } from "zustand";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import type { Task } from "@/lib/types";
import { cn, formatBytes } from "@/lib/utils";

type Level = "low" | "recommended" | "extreme" | "custom";
type Unit = "KB" | "MB";

const LEVELS: Level[] = ["low", "recommended", "extreme", "custom"];
const MAX_TARGET_KB = 4 * 1024 * 1024;

type CompressTargetState = {
  targetBytes: number | null;
  setTargetBytes: (value: number | null) => void;
};

const useCompressTarget = create<CompressTargetState>((set) => ({
  targetBytes: null,
  setTargetBytes: (targetBytes) => set({ targetBytes }),
}));

function targetKilobytes(amount: number, unit: Unit): number | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const kilobytes = Math.round(unit === "MB" ? amount * 1024 : amount);
  return kilobytes >= 1 && kilobytes <= MAX_TARGET_KB ? kilobytes : null;
}

export function useCompressPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_compress");
  const [level, setLevel] = useState<Level>("recommended");
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState<Unit>("MB");
  const [grayscale, setGrayscale] = useState(false);
  const [stripMetadata, setStripMetadata] = useState(false);
  const setTargetBytes = useCompressTarget((state) => state.setTargetBytes);

  const target = level === "custom" ? targetKilobytes(amount, unit) : null;
  useEffect(() => {
    setTargetBytes(target === null ? null : target * 1024);
  }, [setTargetBytes, target]);

  const payload: Record<string, unknown> = {
    level,
    grayscale,
    strip_metadata: stripMetadata,
    ...(level === "custom" && target !== null ? { target_kb: target } : {}),
  };
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);

  const options = (
    <div className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("legend")}</legend>
        <div className="flex flex-col gap-2" role="radiogroup">
          {LEVELS.map((option) => (
            <label
              key={option}
              data-compress-level={option}
              className={cn(
                "flex cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2 text-start transition-colors",
                option === level
                  ? "border-primary bg-primary-subtle"
                  : "border-border hover:border-primary/50",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name="compress-level"
                checked={option === level}
                onChange={() => setLevel(option)}
              />
              <span className="text-sm font-semibold">{t(`levels.${option}.title`)}</span>
              <span className="text-xs text-muted">{t(`levels.${option}.description`)}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {level === "custom" ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="compress-target" className="text-sm font-medium">
            {t("targetLabel")}
          </label>
          <div className="flex gap-2">
            <Input
              id="compress-target"
              dir="ltr"
              type="number"
              inputMode="decimal"
              min={0}
              step={unit === "MB" ? 0.1 : 10}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value))}
            />
            <select
              aria-label={t("unitLabel")}
              value={unit}
              onChange={(event) => setUnit(event.target.value === "KB" ? "KB" : "MB")}
              className="rounded-lg border border-border bg-surface px-2 text-sm"
            >
              <option value="KB">{t("unitKB")}</option>
              <option value="MB">{t("unitMB")}</option>
            </select>
          </div>
          <p className="text-xs text-muted">{t("targetHint")}</p>
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <ToggleRow
          id="compress-grayscale"
          label={t("grayscale")}
          description={t("grayscaleHint")}
          checked={grayscale}
          onChange={setGrayscale}
        />
        <ToggleRow
          id="compress-metadata"
          label={t("stripMetadata")}
          description={t("stripMetadataHint")}
          checked={stripMetadata}
          onChange={setStripMetadata}
        />
      </div>
    </div>
  );

  return {
    main: null,
    options,
    payload,
    problem: level === "custom" && target === null ? t("targetProblem") : null,
    summary: files.length
      ? t("summary", { count: files.length, size: formatBytes(totalBytes) })
      : null,
  };
}

function Preview({ fileId, label }: { fileId: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <figure className="flex flex-col items-center gap-1.5">
      <img
        src={`/api/v1/files/${fileId}/pages/1/thumbnail?width=240`}
        alt={label}
        loading="lazy"
        width={240}
        className="max-h-72 w-auto rounded-lg border border-border bg-white shadow-sm"
        onError={() => setFailed(true)}
      />
      <figcaption className="text-xs text-muted">{label}</figcaption>
    </figure>
  );
}

export function CompressResult({ task }: { task: Task }) {
  const t = useTranslations("tool_compress.result");
  const targetBytes = useCompressTarget((state) => state.targetBytes);
  const pdfOutputs = task.outputs.filter((output) => output.kind === "pdf");
  const saved =
    task.input_bytes > 0
      ? Math.max(0, Math.round((1 - task.output_bytes / task.input_bytes) * 100))
      : 0;
  const unchanged = task.output_bytes >= task.input_bytes;
  const missedTarget =
    targetBytes !== null &&
    pdfOutputs.length === 1 &&
    task.inputs.length === 1 &&
    task.output_bytes > targetBytes;
  const input = task.inputs[0];
  const output = pdfOutputs[0];
  const compare = !task.files_deleted && task.inputs.length === 1 && pdfOutputs.length === 1;

  return (
    <div className="flex w-full flex-col items-center gap-4" data-compress-result>
      <div className="flex flex-col items-center gap-1">
        <p className="text-h3 font-bold text-success-strong" data-compress-saved={saved}>
          {unchanged ? t("alreadyOptimized") : t("saved", { percent: saved })}
        </p>
        <p className="text-sm text-muted" dir="ltr">
          {t("sizes", {
            input: formatBytes(task.input_bytes),
            output: formatBytes(task.output_bytes),
          })}
        </p>
        {missedTarget ? (
          <p className="text-sm text-muted" data-compress-target-missed>
            {t("targetMissed", { target: formatBytes(targetBytes) })}
          </p>
        ) : null}
      </div>
      {compare && input && output ? (
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-medium">{t("compareTitle")}</p>
          <div className="flex flex-wrap justify-center gap-4">
            <Preview fileId={input.id} label={t("before")} />
            <Preview fileId={output.id} label={t("after")} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
