"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ChangeEvent } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type JsonSchema = {
  type?: string | string[];
  enum?: unknown[];
  default?: unknown;
  title?: string;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  items?: JsonSchema;
  anyOf?: JsonSchema[];
  $ref?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  $defs?: Record<string, JsonSchema>;
};

type FieldKind =
  | "boolean"
  | "enum"
  | "multi"
  | "number"
  | "integer"
  | "text"
  | "area"
  | "lines"
  | "image"
  | "skip";

const LONG_TEXT_FIELDS = new Set([
  "text",
  "content",
  "pattern",
  "patterns",
  "markdown",
  "html",
  "question",
]);
const IMAGE_FIELDS = new Set(["image_data", "signature_image"]);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

function resolve(schema: JsonSchema, root: JsonSchema): JsonSchema {
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop() ?? "";
    return root.$defs?.[name] ?? schema;
  }
  if (schema.anyOf) {
    const concrete = schema.anyOf.find((entry) => entry.type !== "null") ?? schema.anyOf[0];
    return { ...resolve(concrete, root), default: schema.default };
  }
  return schema;
}

function kindOf(name: string, schema: JsonSchema): FieldKind {
  if (IMAGE_FIELDS.has(name)) return "image";
  if (schema.enum) return "enum";
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "boolean") return "boolean";
  if (type === "integer") return "integer";
  if (type === "number") return "number";
  if (type === "array" && schema.items?.enum) return "multi";
  if (type === "array" && (schema.items?.type === "string" || !schema.items?.type)) return "lines";
  if (type === "string") {
    return LONG_TEXT_FIELDS.has(name) || (schema.maxLength ?? 0) > 400 ? "area" : "text";
  }
  return "skip";
}

function humanize(name: string): string {
  const words = name.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolveRead, rejectRead) => {
    const reader = new FileReader();
    reader.onload = () => resolveRead(String(reader.result));
    reader.onerror = () => rejectRead(reader.error);
    reader.readAsDataURL(file);
  });
}

type FieldState = Record<string, unknown>;

export function useSchemaPanel(
  files: LocalFile[],
  schema?: Record<string, unknown>,
): ToolPanelView {
  const t = useTranslations("schemaFields");
  const root = (schema ?? {}) as JsonSchema;
  const fields = useMemo(() => {
    const properties = root.properties ?? {};
    return Object.entries(properties)
      .map(([name, raw]) => {
        const resolved = resolve(raw, root);
        return { name, schema: resolved, kind: kindOf(name, resolved) };
      })
      .filter((field) => field.kind !== "skip");
  }, [root]);
  const [values, setValues] = useState<FieldState>({});
  const [imageError, setImageError] = useState<string | null>(null);
  const required = new Set(root.required ?? []);
  const label = (name: string) => (t.has(name) ? t(name) : humanize(name));
  const optionLabel = (name: string, option: unknown) => {
    const key = `${name}_${String(option)}`;
    return t.has(key) ? t(key) : humanize(String(option));
  };
  const set = (name: string, value: unknown) =>
    setValues((current) => ({ ...current, [name]: value }));
  const current = (name: string, fallback: unknown) => (name in values ? values[name] : fallback);

  const payload: Record<string, unknown> = {};
  let problem: string | null = imageError;
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || value === "") {
      if (required.has(field.name) && field.schema.default === undefined) {
        problem = problem ?? t("requiredField", { field: label(field.name) });
      }
      continue;
    }
    if (field.kind === "multi") {
      if (Array.isArray(value) && value.length) payload[field.name] = value;
    } else if (field.kind === "lines") {
      const lines = String(value)
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length) payload[field.name] = lines;
    } else if (field.kind === "number" || field.kind === "integer") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) payload[field.name] = parsed;
    } else {
      payload[field.name] = value;
    }
  }

  const onImage = async (name: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError(t("imageTooLarge"));
      return;
    }
    setImageError(null);
    set(name, await readFileAsDataUrl(file));
  };

  const controls = fields.map(({ name, schema: field, kind }) => {
    const id = `schema-${name}`;
    const fallback = field.default;
    if (kind === "boolean") {
      return (
        <ToggleRow
          key={name}
          id={id}
          label={label(name)}
          description={t.has(`${name}_hint`) ? t(`${name}_hint`) : label(name)}
          checked={Boolean(current(name, fallback))}
          onChange={(value) => set(name, value)}
        />
      );
    }
    if (kind === "multi") {
      const chosen = (current(name, []) as string[]) ?? [];
      return (
        <fieldset key={name} className="flex flex-col gap-1.5">
          <legend className="mb-1 text-sm font-medium">{label(name)}</legend>
          {(field.items?.enum ?? []).map((option) => {
            const value = String(option);
            return (
              <label key={value} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={chosen.includes(value)}
                  onChange={(event) =>
                    set(
                      name,
                      event.target.checked
                        ? [...chosen, value]
                        : chosen.filter((entry) => entry !== value),
                    )
                  }
                />
                {optionLabel(name, option)}
              </label>
            );
          })}
        </fieldset>
      );
    }
    return (
      <div key={name} className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-sm font-medium">
          {label(name)}
          {required.has(name) ? <span aria-hidden> *</span> : null}
        </label>
        {kind === "enum" ? (
          <select
            id={id}
            className="h-10 rounded-(--radius-control) border border-border-strong bg-surface px-2 text-sm"
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          >
            {(field.enum ?? []).map((option) => (
              <option key={String(option)} value={String(option)}>
                {optionLabel(name, option)}
              </option>
            ))}
          </select>
        ) : null}
        {kind === "number" || kind === "integer" ? (
          <Input
            id={id}
            dir="ltr"
            type="number"
            inputMode="decimal"
            min={field.minimum}
            max={field.maximum}
            step={kind === "integer" ? 1 : "any"}
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : null}
        {kind === "text" ? (
          <Input
            id={id}
            maxLength={field.maxLength}
            value={String(current(name, fallback) ?? "")}
            onChange={(event) => set(name, event.target.value)}
          />
        ) : null}
        {kind === "area" || kind === "lines" ? (
          <textarea
            id={id}
            rows={kind === "area" ? 6 : 4}
            maxLength={field.maxLength}
            value={String(
              current(
                name,
                Array.isArray(fallback) ? (fallback as string[]).join("\n") : fallback,
              ) ?? "",
            )}
            onChange={(event) => set(name, event.target.value)}
            className={cn(
              "rounded-(--radius-control) border border-border-strong bg-surface p-2 text-sm",
              kind === "lines" && "font-mono",
            )}
          />
        ) : null}
        {kind === "image" ? (
          <input
            id={id}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(event) => void onImage(name, event)}
            className="text-sm"
          />
        ) : null}
        {t.has(`${name}_hint`) ? <p className="text-xs text-muted">{t(`${name}_hint`)}</p> : null}
      </div>
    );
  });

  return {
    main: null,
    options: controls.length ? (
      <div className="flex flex-col gap-4" data-schema-options>
        {controls}
      </div>
    ) : null,
    payload,
    problem,
    summary: t("summary", { count: Math.max(files.length, 1) }),
  };
}
