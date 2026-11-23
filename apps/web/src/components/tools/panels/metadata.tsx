"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { apiJson } from "@/lib/api";

const FIELD_KEYS = [
  "title",
  "author",
  "subject",
  "keywords",
  "creator",
  "producer",
  "creation_date",
  "modification_date",
] as const;

type FieldKey = (typeof FIELD_KEYS)[number];
type FieldValues = Record<FieldKey, string>;
type HiddenKey = "attachments" | "javascript" | "thumbnails";
const HIDDEN_KEYS: HiddenKey[] = ["attachments", "javascript", "thumbnails"];

type InspectedMetadata = Record<FieldKey, string | null> & {
  custom: Record<string, string>;
  has_info: boolean;
  has_xmp: boolean;
  pages_with_xmp: number;
  hidden: Record<HiddenKey, number>;
};

type CustomRow = { id: number; key: string; value: string };

const DATE_FIELDS: ReadonlySet<FieldKey> = new Set(["creation_date", "modification_date"]);
const PDF_DATE = /^D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'\d{2}'?)?$/;
const CUSTOM_KEY = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;
const RESERVED_KEYS = new Set([
  "Title",
  "Author",
  "Subject",
  "Keywords",
  "Creator",
  "Producer",
  "CreationDate",
  "ModDate",
  "Trapped",
]);
const MAX_TEXT = 2000;
const MAX_CUSTOM = 50;

const EMPTY_FIELDS: FieldValues = {
  title: "",
  author: "",
  subject: "",
  keywords: "",
  creator: "",
  producer: "",
  creation_date: "",
  modification_date: "",
};

export function isValidPdfDate(value: string): boolean {
  const match = PDF_DATE.exec(value);
  if (!match) return false;
  const [year, month, day, hour, minute, second] = match.slice(1, 7).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function customKeyProblem(key: string): "format" | "reserved" | null {
  if (!CUSTOM_KEY.test(key)) return "format";
  if (RESERVED_KEYS.has(key)) return "reserved";
  return null;
}

function useInspectedMetadata(file: LocalFile | undefined): InspectedMetadata | null {
  const [state, setState] = useState<{ id: string; data: InspectedMetadata } | null>(null);
  const fileId = file?.status === "ready" ? file.uploadId : null;
  const password = file?.encrypted && file.unlocked ? file.password : "";
  const blocked = Boolean(file?.encrypted && !file.unlocked);
  useEffect(() => {
    if (!fileId || blocked) return;
    let cancelled = false;
    apiJson<{ metadata?: InspectedMetadata }>(`/api/v1/files/${fileId}/inspect`, {
      method: "POST",
      json: password ? { password } : {},
    })
      .then((result) => {
        if (!cancelled && result.metadata) setState({ id: fileId, data: result.metadata });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [fileId, password, blocked]);
  return state && state.id === fileId ? state.data : null;
}

export function useMetadataPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_metadata");
  const first = files[0];
  const before = useInspectedMetadata(first);
  const [fields, setFields] = useState<FieldValues>(EMPTY_FIELDS);
  const [custom, setCustom] = useState<CustomRow[]>([]);
  const [nextId, setNextId] = useState(1);
  const [loadedFrom, setLoadedFrom] = useState<InspectedMetadata | null>(null);
  const [removeAll, setRemoveAll] = useState(false);
  const [hidden, setHidden] = useState<Record<HiddenKey, boolean>>({
    attachments: false,
    javascript: false,
    thumbnails: false,
  });

  if (before && before !== loadedFrom) {
    setLoadedFrom(before);
    setFields(Object.fromEntries(FIELD_KEYS.map((key) => [key, before[key] ?? ""])) as FieldValues);
    const rows = Object.entries(before.custom).map(([key, value], index) => ({
      id: index + 1,
      key,
      value,
    }));
    setCustom(rows);
    setNextId(rows.length + 1);
  }

  const baseline: FieldValues = before
    ? (Object.fromEntries(FIELD_KEYS.map((key) => [key, before[key] ?? ""])) as FieldValues)
    : EMPTY_FIELDS;
  const changedFields = FIELD_KEYS.filter((key) => fields[key].trim() !== baseline[key].trim());
  const invalidDates = FIELD_KEYS.filter(
    (key) => DATE_FIELDS.has(key) && fields[key].trim() && !isValidPdfDate(fields[key].trim()),
  );
  const activeRows = custom.filter((row) => row.key.trim() || row.value.trim());
  const keyProblems = activeRows
    .map((row) => customKeyProblem(row.key.trim()))
    .filter((problem): problem is "format" | "reserved" => problem !== null);
  const keys = activeRows.map((row) => row.key.trim());
  const duplicate = new Set(keys).size !== keys.length;
  const tooLong =
    FIELD_KEYS.some((key) => fields[key].length > MAX_TEXT) ||
    activeRows.some((row) => row.value.length > MAX_TEXT);

  const customPayload: Record<string, string> = {};
  const beforeCustom = before?.custom ?? {};
  for (const row of activeRows) {
    const key = row.key.trim();
    if (beforeCustom[key] !== row.value.trim()) customPayload[key] = row.value.trim();
  }
  for (const key of Object.keys(beforeCustom)) {
    if (!keys.includes(key)) customPayload[key] = "";
  }

  const hiddenPayload = {
    remove_attachments: hidden.attachments,
    remove_javascript: hidden.javascript,
    remove_thumbnails: hidden.thumbnails,
  };
  const payload: Record<string, unknown> = removeAll
    ? { remove_all: true, ...hiddenPayload }
    : {
        ...Object.fromEntries(changedFields.map((key) => [key, fields[key].trim()])),
        custom: customPayload,
        ...hiddenPayload,
      };

  const problem = removeAll
    ? null
    : invalidDates.length
      ? t("invalidDate")
      : keyProblems.includes("reserved")
        ? t("reservedKey")
        : keyProblems.length
          ? t("invalidKey")
          : duplicate
            ? t("duplicateKey")
            : tooLong
              ? t("tooLong", { max: MAX_TEXT })
              : activeRows.length > MAX_CUSTOM
                ? t("tooManyCustom", { max: MAX_CUSTOM })
                : changedFields.length === 0 &&
                    Object.keys(customPayload).length === 0 &&
                    !HIDDEN_KEYS.some((key) => hidden[key])
                  ? t("nothingToChange")
                  : null;

  const removals = HIDDEN_KEYS.filter((key) => hidden[key]).map((key) =>
    t(`removeCount.${key}`, { count: before?.hidden[key] ?? 0 }),
  );
  const editCount = changedFields.length + Object.keys(customPayload).length;
  const summaryParts = [
    removeAll ? t("summaryRemoveAll") : editCount ? t("summaryEdits", { count: editCount }) : null,
    removals.length ? t("summaryHidden", { items: removals.join(", ") }) : null,
  ].filter((part): part is string => part !== null);

  const afterValue = (key: FieldKey) => (removeAll ? "" : fields[key].trim());
  const tableRows: { id: string; label: string; before: string; after: string }[] = [
    ...FIELD_KEYS.map((key) => ({
      id: key,
      label: t(`fields.${key}`),
      before: before?.[key] ?? "",
      after: afterValue(key),
    })),
    ...[...new Set([...Object.keys(beforeCustom), ...keys])].map((key) => ({
      id: `custom-${key}`,
      label: key,
      before: beforeCustom[key] ?? "",
      after: removeAll
        ? ""
        : (activeRows.find((row) => row.key.trim() === key)?.value.trim() ?? ""),
    })),
  ];

  const main =
    files.length > 0 ? (
      <section
        className="overflow-x-auto rounded-xl border border-border bg-surface"
        aria-label={t("tableLabel")}
        data-metadata-table
      >
        <table className="w-full text-start text-sm">
          <thead className="bg-surface-muted text-xs text-muted">
            <tr>
              <th scope="col" className="p-3 text-start font-medium">
                {t("property")}
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                {t("before")}
              </th>
              <th scope="col" className="p-3 text-start font-medium">
                {t("after")}
              </th>
            </tr>
          </thead>
          <tbody>
            {tableRows.map((row) => (
              <tr key={row.id} className="border-t border-border" data-metadata-row={row.id}>
                <th scope="row" className="p-3 text-start font-medium">
                  {row.label}
                </th>
                <td className="max-w-48 truncate p-3 text-muted" data-before dir="auto">
                  {row.before || "—"}
                </td>
                <td
                  className={
                    row.after !== row.before
                      ? "max-w-48 truncate p-3 font-medium text-primary"
                      : "max-w-48 truncate p-3"
                  }
                  data-after
                  dir="auto"
                >
                  {row.after || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {before ? (
          <p className="border-t border-border p-3 text-xs text-muted">
            {t("hiddenFound", {
              attachments: before.hidden.attachments,
              javascript: before.hidden.javascript,
              thumbnails: before.hidden.thumbnails,
            })}
            {files.length > 1 ? ` ${t("batchNote", { count: files.length })}` : ""}
          </p>
        ) : (
          <p className="border-t border-border p-3 text-xs text-muted">
            {first?.encrypted && !first.unlocked ? t("unlockFirst") : t("loading")}
          </p>
        )}
      </section>
    ) : null;

  const options = (
    <div className="flex flex-col gap-4" data-metadata-options>
      <ToggleRow
        id="metadata-remove-all"
        label={t("removeAll")}
        description={t("removeAllHint")}
        checked={removeAll}
        onChange={setRemoveAll}
      />
      <fieldset className="flex flex-col gap-3" disabled={removeAll}>
        <legend className="sr-only">{t("propertiesLegend")}</legend>
        {FIELD_KEYS.map((key) => {
          const id = `metadata-${key}`;
          const invalid = invalidDates.includes(key);
          return (
            <div key={key} className="flex flex-col gap-1.5">
              <label htmlFor={id} className="text-sm font-medium">
                {t(`fields.${key}`)}
              </label>
              <Input
                id={id}
                dir="auto"
                className="h-9"
                maxLength={DATE_FIELDS.has(key) ? 32 : MAX_TEXT}
                placeholder={DATE_FIELDS.has(key) ? "D:20240131093000" : undefined}
                value={fields[key]}
                invalid={invalid}
                onChange={(event) =>
                  setFields((current) => ({ ...current, [key]: event.target.value }))
                }
                data-metadata-field={key}
              />
              {DATE_FIELDS.has(key) ? <p className="text-xs text-muted">{t("dateHint")}</p> : null}
            </div>
          );
        })}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{t("customTitle")}</p>
          {custom.map((row) => (
            <div key={row.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                aria-label={t("customKey")}
                className="h-9"
                maxLength={64}
                placeholder={t("customKey")}
                value={row.key}
                invalid={Boolean(row.key.trim() && customKeyProblem(row.key.trim()))}
                onChange={(event) =>
                  setCustom((current) =>
                    current.map((item) =>
                      item.id === row.id ? { ...item, key: event.target.value } : item,
                    ),
                  )
                }
              />
              <Input
                aria-label={t("customValue")}
                className="h-9"
                dir="auto"
                maxLength={MAX_TEXT}
                placeholder={t("customValue")}
                value={row.value}
                onChange={(event) =>
                  setCustom((current) =>
                    current.map((item) =>
                      item.id === row.id ? { ...item, value: event.target.value } : item,
                    ),
                  )
                }
              />
              <button
                type="button"
                className="rounded-md p-2 text-muted hover:text-danger"
                aria-label={t("customRemove")}
                onClick={() => setCustom((current) => current.filter((item) => item.id !== row.id))}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ))}
          {custom.length < MAX_CUSTOM ? (
            <button
              type="button"
              className="flex items-center gap-1.5 self-start text-sm font-medium text-primary"
              onClick={() => {
                setCustom((current) => [...current, { id: nextId, key: "", value: "" }]);
                setNextId((value) => value + 1);
              }}
            >
              <Plus className="size-4" aria-hidden />
              {t("customAdd")}
            </button>
          ) : null}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1 text-sm font-medium">{t("hiddenTitle")}</legend>
        {HIDDEN_KEYS.map((key) => (
          <ToggleRow
            key={key}
            id={`metadata-hidden-${key}`}
            label={t(`hidden.${key}`, { count: before?.hidden[key] ?? 0 })}
            description={t(`hiddenHint.${key}`)}
            checked={hidden[key]}
            onChange={(value) => setHidden((current) => ({ ...current, [key]: value }))}
          />
        ))}
      </fieldset>
    </div>
  );

  return {
    main,
    options,
    payload,
    problem,
    summary: summaryParts.length ? summaryParts.join(" · ") : null,
  };
}
