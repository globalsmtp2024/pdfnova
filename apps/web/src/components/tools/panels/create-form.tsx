"use client";

import {
  CheckSquare,
  ChevronDownSquare,
  CircleDot,
  MousePointer2,
  PenLine,
  TextCursorInput,
  Trash2,
  WrapText,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { FieldPlacer, type PlacedBox } from "@/components/tools/field-placer";
import { usePdfDocument } from "@/components/tools/pdf-page-canvas";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { newId } from "@/lib/editor-ops";
import { cn } from "@/lib/utils";

type FormKind = "text" | "multiline" | "checkbox" | "radio" | "dropdown" | "signature";
type FormField = PlacedBox & {
  kind: FormKind;
  name: string;
  tooltip: string;
  required: boolean;
  read_only: boolean;
  value: string;
  choices: string[];
  export_value: string;
  font_size: number;
};

const NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const KINDS: { id: FormKind; icon: LucideIcon }[] = [
  { id: "text", icon: TextCursorInput },
  { id: "multiline", icon: WrapText },
  { id: "checkbox", icon: CheckSquare },
  { id: "radio", icon: CircleDot },
  { id: "dropdown", icon: ChevronDownSquare },
  { id: "signature", icon: PenLine },
];
const SIZES: Record<FormKind, { width: number; height: number }> = {
  text: { width: 30, height: 3.6 },
  multiline: { width: 40, height: 10 },
  checkbox: { width: 2.8, height: 2.2 },
  radio: { width: 2.8, height: 2.2 },
  dropdown: { width: 30, height: 3.6 },
  signature: { width: 30, height: 7 },
};

export function useCreateFormPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_create_form");
  const file = files[0];
  const { document, failed } = usePdfDocument(file);
  const [state, setState] = useState<{ key?: string; fields: FormField[] }>({ fields: [] });
  const fields = state.key === file?.key ? state.fields : [];
  const setFields = (next: FormField[]) => setState({ key: file?.key, fields: next });
  const [placing, setPlacing] = useState<FormKind | null>("text");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = fields.find((field) => field.id === selectedId) ?? null;
  const pageCount = document?.numPages ?? file?.pageCount ?? 1;

  const update = (patch: Partial<FormField>) => {
    if (!selected) return;
    setFields(fields.map((field) => (field.id === selected.id ? { ...field, ...patch } : field)));
  };

  const create = (
    kind: string,
    page: number,
    box: { x: number; y: number; width: number; height: number },
  ) => {
    const type = kind as FormKind;
    const count = fields.filter((field) => field.kind === type).length + 1;
    const taken = new Set(fields.map((field) => field.name));
    let name = `${type}_${count}`;
    let suffix = count;
    while (taken.has(name) && type !== "radio") {
      suffix += 1;
      name = `${type}_${suffix}`;
    }
    const radios = fields.filter((field) => field.kind === "radio" && field.name === "choice");
    const created: FormField = {
      id: newId(),
      page,
      kind: type,
      ...box,
      name: type === "radio" ? "choice" : name,
      tooltip: "",
      required: false,
      read_only: false,
      value: "",
      choices: type === "dropdown" ? ["Option 1", "Option 2"] : [],
      export_value: type === "radio" ? `Option${radios.length + 1}` : "Yes",
      font_size: 0,
    };
    return created;
  };

  const nameCounts = new Map<string, number>();
  for (const field of fields) {
    if (field.kind !== "radio") nameCounts.set(field.name, (nameCounts.get(field.name) ?? 0) + 1);
  }
  const duplicate = [...nameCounts.values()].some((count) => count > 1);
  const invalidName = fields.some((field) => !NAME_PATTERN.test(field.name));
  const emptyDropdown = fields.some((field) => field.kind === "dropdown" && !field.choices.length);
  const problem = !fields.length
    ? t("problems.none")
    : invalidName
      ? t("problems.invalidName")
      : duplicate
        ? t("problems.duplicate")
        : emptyDropdown
          ? t("problems.noChoices")
          : null;

  const main = failed ? (
    <p className="text-sm text-danger-strong" role="alert">
      {t("loadFailed")}
    </p>
  ) : (
    <FieldPlacer
      document={document}
      pageCount={pageCount}
      fields={fields}
      onChange={setFields}
      placing={placing}
      create={create}
      defaultSize={(kind) => SIZES[kind as FormKind]}
      selectedId={selectedId}
      onSelect={setSelectedId}
      renderLabel={(field) => <span className="truncate">{field.name}</span>}
    />
  );

  const options = (
    <div className="flex flex-col gap-4" data-create-form-panel>
      <div className="grid grid-cols-3 gap-1.5" role="toolbar" aria-label={t("kinds")}>
        <button
          type="button"
          aria-pressed={placing === null}
          title={t("select")}
          aria-label={t("select")}
          onClick={() => setPlacing(null)}
          className={cn(
            "flex h-10 items-center justify-center rounded-lg border",
            placing === null
              ? "border-primary bg-primary-subtle"
              : "border-border hover:bg-surface-muted",
          )}
        >
          <MousePointer2 className="size-4" aria-hidden />
        </button>
        {KINDS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            type="button"
            aria-pressed={placing === id}
            title={t(`kind.${id}`)}
            aria-label={t(`kind.${id}`)}
            data-form-kind={id}
            onClick={() => {
              setPlacing(id);
              setSelectedId(null);
            }}
            className={cn(
              "flex h-10 items-center justify-center rounded-lg border",
              placing === id
                ? "border-primary bg-primary-subtle"
                : "border-border hover:bg-surface-muted",
            )}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted">{placing ? t(`hint.${placing}`) : t("hint.select")}</p>

      {selected ? (
        <fieldset className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <legend className="px-1 text-sm font-medium">{t(`kind.${selected.kind}`)}</legend>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {selected.kind === "radio" ? t("groupName") : t("fieldName")}
            <Input
              value={selected.name}
              onChange={(event) => update({ name: event.target.value })}
              aria-invalid={!NAME_PATTERN.test(selected.name)}
              data-form-name
            />
          </label>
          {selected.kind === "radio" ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("exportValue")}
              <Input
                value={selected.export_value}
                onChange={(event) => update({ export_value: event.target.value })}
              />
            </label>
          ) : null}
          {selected.kind === "dropdown" ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("choices")}
              <textarea
                rows={4}
                value={selected.choices.join("\n")}
                onChange={(event) =>
                  update({ choices: event.target.value.split("\n").filter((line) => line.trim()) })
                }
                className="w-full rounded-md border border-border bg-surface p-2 text-sm"
              />
            </label>
          ) : null}
          {selected.kind === "text" || selected.kind === "multiline" ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              {t("defaultValue")}
              <Input
                value={selected.value}
                onChange={(event) => update({ value: event.target.value })}
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t("tooltip")}
            <Input
              value={selected.tooltip}
              onChange={(event) => update({ tooltip: event.target.value })}
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.required}
              onChange={(event) => update({ required: event.target.checked })}
            />
            {t("required")}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.read_only}
              onChange={(event) => update({ read_only: event.target.checked })}
            />
            {t("readOnly")}
          </label>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setFields(fields.filter((field) => field.id !== selected.id));
              setSelectedId(null);
            }}
          >
            <Trash2 aria-hidden />
            {t("delete")}
          </Button>
        </fieldset>
      ) : null}
    </div>
  );

  return {
    main,
    options,
    payload: {
      fields: fields.map((field) => ({
        kind: field.kind,
        name: field.name,
        page: field.page,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        value: field.value,
        choices: field.choices,
        export_value: field.export_value,
        tooltip: field.tooltip,
        required: field.required,
        read_only: field.read_only,
        font_size: field.font_size,
      })),
    },
    problem,
    summary: fields.length && !problem ? t("summary", { count: fields.length }) : null,
  };
}
