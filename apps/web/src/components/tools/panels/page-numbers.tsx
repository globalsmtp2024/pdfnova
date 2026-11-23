"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { ToggleRow } from "@/components/tools/option-panels";
import type { ToolPanelView } from "@/components/tools/panels/registry";
import {
  ChoiceGroup,
  ColorField,
  FONT_KEYS,
  FONT_LABELS,
  NumberInput,
  PlacedText,
  PositionGrid,
  RangeField,
  SelectField,
  StampPreview,
  type FontKey,
} from "@/components/tools/stamp-controls";
import type { LocalFile } from "@/components/tools/use-tool-session";
import { Input } from "@/components/ui/input";
import { parsePageSet } from "@/lib/page-expression";
import {
  ANCHORS,
  POINTS_PER_MM,
  anchorCenter,
  numberedPages,
  pageLabel,
  templateProblem,
  type Anchor,
  type Digits,
  type LabelFormat,
  type NumberStyle,
} from "@/lib/stamp-placement";

const FORMATS: LabelFormat[] = ["n", "page_n", "n_of_total", "page_n_of_total", "custom"];
const STYLES: NumberStyle[] = [
  "decimal",
  "roman_lower",
  "roman_upper",
  "letters_lower",
  "letters_upper",
];
const DIGITS: Digits[] = ["western", "arabic_indic", "extended_arabic_indic"];

export function usePageNumbersPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_page_numbers");
  const first = files[0];
  const pageCount = first?.pageCount ?? 0;
  const [position, setPosition] = useState<Anchor>("bottom-center");
  const [unit, setUnit] = useState<"pt" | "mm">("pt");
  const [marginX, setMarginX] = useState(36);
  const [marginY, setMarginY] = useState(28);
  const [mirror, setMirror] = useState(false);
  const [format, setFormat] = useState<LabelFormat>("n");
  const [template, setTemplate] = useState("{n}");
  const [style, setStyle] = useState<NumberStyle>("decimal");
  const [digits, setDigits] = useState<Digits>("western");
  const [direction, setDirection] = useState<"auto" | "ltr" | "rtl">("auto");
  const [startNumber, setStartNumber] = useState(1);
  const [firstPage, setFirstPage] = useState(1);
  const [skipFirst, setSkipFirst] = useState(0);
  const [skipLast, setSkipLast] = useState(0);
  const [pages, setPages] = useState("");
  const [parity, setParity] = useState<"all" | "odd" | "even">("all");
  const [font, setFont] = useState<FontKey>("noto-sans");
  const [size, setSize] = useState(11);
  const [color, setColor] = useState("#000000");
  const [opacity, setOpacity] = useState(1);
  const [bold, setBold] = useState(false);

  const templateIssue = format === "custom" ? templateProblem(template) : null;
  const pageSet = pages.trim() && pageCount ? parsePageSet(pages, pageCount) : null;
  const pagesInvalid = Boolean(pages.trim() && pageCount && !pageSet);
  const plan = pageCount
    ? numberedPages(
        { startNumber, firstPage, skipFirst, skipLast, parity, pages: pageSet },
        pageCount,
      )
    : [];
  const firstNumbered = plan.find((entry) => entry.index === 0) ?? null;
  const factor = unit === "mm" ? POINTS_PER_MM : 1;
  const previewText = firstNumbered
    ? pageLabel(format, template, style, digits, firstNumbered.number, firstNumbered.total)
    : null;

  const anchorLabels = Object.fromEntries(
    ANCHORS.map((anchor) => [anchor, t(`anchors.${anchor}`)]),
  ) as Record<Anchor, string>;

  const problem = templateIssue
    ? t(`template.${templateIssue}`)
    : pagesInvalid
      ? t("pagesInvalid")
      : pageCount && plan.length === 0
        ? t("nothing")
        : null;

  const preview =
    first && pageCount > 0 ? (
      <StampPreview
        fileId={first.uploadId}
        label={t("previewAlt", { name: first.name })}
        caption={previewText ? t("previewCaption") : t("previewSkipped")}
      >
        {({ page, scale }) =>
          previewText ? (
            <PlacedText
              text={previewText}
              style={{ font, size, bold, color, opacity, direction }}
              scale={scale}
              page={page}
              rotation={0}
              place={(box) => [
                anchorCenter(position, page, box, marginX * factor, marginY * factor),
              ]}
            />
          ) : null
        }
      </StampPreview>
    ) : null;

  return {
    main: preview,
    options: (
      <div className="flex flex-col gap-4" data-page-numbers-options>
        <PositionGrid
          legend={t("position")}
          value={position}
          onChange={setPosition}
          labels={anchorLabels}
        />
        <div className="grid grid-cols-3 gap-2">
          <NumberInput
            id="pn-margin-x"
            label={t("marginX")}
            value={marginX}
            min={0}
            max={2000}
            onChange={setMarginX}
          />
          <NumberInput
            id="pn-margin-y"
            label={t("marginY")}
            value={marginY}
            min={0}
            max={2000}
            onChange={setMarginY}
          />
          <SelectField
            id="pn-unit"
            label={t("unit")}
            value={unit}
            onChange={setUnit}
            options={[
              { value: "pt", label: t("units.pt") },
              { value: "mm", label: t("units.mm") },
            ]}
          />
        </div>
        <ToggleRow
          id="pn-mirror"
          label={t("mirror")}
          description={t("mirrorHint")}
          checked={mirror}
          onChange={setMirror}
        />
        <SelectField
          id="pn-format"
          label={t("format")}
          value={format}
          onChange={setFormat}
          options={FORMATS.map((value) => ({ value, label: t(`formats.${value}`) }))}
        />
        {format === "custom" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pn-template" className="text-sm font-medium">
              {t("template.label")}
            </label>
            <Input
              id="pn-template"
              className="h-9"
              dir="auto"
              value={template}
              maxLength={200}
              invalid={Boolean(templateIssue)}
              onChange={(event) => setTemplate(event.target.value)}
            />
            <p className="text-xs text-muted">{t("template.hint")}</p>
            <button
              type="button"
              className="self-start text-xs font-medium text-primary"
              onClick={() => {
                setTemplate("صفحہ {n}");
                setFont("noto-nastaliq-urdu");
                setDigits("extended_arabic_indic");
              }}
            >
              {t("template.urdu")}
            </button>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            id="pn-style"
            label={t("style")}
            value={style}
            onChange={setStyle}
            options={STYLES.map((value) => ({ value, label: t(`styles.${value}`) }))}
          />
          <SelectField
            id="pn-digits"
            label={t("digits")}
            value={digits}
            onChange={setDigits}
            options={DIGITS.map((value) => ({ value, label: t(`digitSets.${value}`) }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput
            id="pn-start"
            label={t("startNumber")}
            value={startNumber}
            min={0}
            max={1000000}
            onChange={setStartNumber}
          />
          <NumberInput
            id="pn-first-page"
            label={t("firstPage")}
            value={firstPage}
            min={1}
            max={1000000}
            onChange={setFirstPage}
          />
          <NumberInput
            id="pn-skip-first"
            label={t("skipFirst")}
            value={skipFirst}
            min={0}
            max={1000000}
            onChange={setSkipFirst}
          />
          <NumberInput
            id="pn-skip-last"
            label={t("skipLast")}
            value={skipLast}
            min={0}
            max={1000000}
            onChange={setSkipLast}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pn-pages" className="text-sm font-medium">
            {t("pages")}
          </label>
          <Input
            id="pn-pages"
            className="h-9"
            dir="ltr"
            value={pages}
            maxLength={2000}
            placeholder={t("pagesPlaceholder")}
            invalid={pagesInvalid}
            onChange={(event) => setPages(event.target.value)}
          />
        </div>
        <ChoiceGroup
          legend={t("parity")}
          name="pn-parity"
          value={parity}
          onChange={setParity}
          options={[
            { value: "all", label: t("parities.all") },
            { value: "odd", label: t("parities.odd") },
            { value: "even", label: t("parities.even") },
          ]}
        />
        <div className="grid grid-cols-2 gap-2">
          <SelectField
            id="pn-font"
            label={t("font")}
            value={font}
            onChange={setFont}
            options={FONT_KEYS.map((value) => ({ value, label: FONT_LABELS[value] }))}
          />
          <NumberInput
            id="pn-size"
            label={t("size")}
            value={size}
            min={4}
            max={200}
            onChange={setSize}
          />
        </div>
        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <ColorField id="pn-color" label={t("color")} value={color} onChange={setColor} />
          <RangeField
            id="pn-opacity"
            label={t("opacity")}
            value={opacity}
            min={0.05}
            max={1}
            step={0.05}
            display={`${Math.round(opacity * 100)}%`}
            onChange={setOpacity}
          />
        </div>
        <ToggleRow
          id="pn-bold"
          label={t("bold")}
          description={t("boldHint")}
          checked={bold}
          onChange={setBold}
        />
        <SelectField
          id="pn-direction"
          label={t("direction")}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "auto", label: t("directions.auto") },
            { value: "ltr", label: t("directions.ltr") },
            { value: "rtl", label: t("directions.rtl") },
          ]}
        />
      </div>
    ),
    payload: {
      position,
      margin_x: marginX,
      margin_y: marginY,
      unit,
      mirror,
      start_number: startNumber,
      first_page: firstPage,
      skip_first: skipFirst,
      skip_last: skipLast,
      pages: pages.trim() || null,
      parity,
      format,
      template: format === "custom" ? template : "{n}",
      style,
      digits,
      direction,
      font,
      size,
      color,
      opacity,
      bold,
    },
    problem,
    summary:
      files.length > 1
        ? t("summaryBatch", { count: files.length })
        : plan.length
          ? t("summary", { count: plan.length })
          : null,
  };
}
