"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

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
  anchorCenter,
  rotatedExtent,
  tileCenters,
  toScreen,
  type Anchor,
  type PageSize,
  type Point,
} from "@/lib/stamp-placement";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TILES = 2500;

type WatermarkImage = { data: string; url: string; name: string; width: number; height: number };
type ImageProblem = "svg" | "type" | "size" | "read" | null;

export function watermarkCenters(
  layout: "single" | "tiled",
  position: Anchor,
  page: PageSize,
  box: PageSize,
  rotation: number,
  margin: number,
  offsetX: number,
  offsetY: number,
  spacing: number,
): Point[] {
  if (layout === "tiled") return tileCenters(page, box, rotation, spacing, MAX_TILES);
  const extent = rotatedExtent(box.width, box.height, rotation);
  return [anchorCenter(position, page, extent, margin, margin, offsetX, offsetY)];
}

function readImage(file: File): Promise<WatermarkImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("read"));
    reader.onload = () => {
      const data = String(reader.result);
      const url = URL.createObjectURL(file);
      const probe = new Image();
      probe.onload = () =>
        resolve({
          data,
          url,
          name: file.name,
          width: probe.naturalWidth,
          height: probe.naturalHeight,
        });
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("read"));
      };
      probe.src = url;
    };
    reader.readAsDataURL(file);
  });
}

export function imageProblemFor(file: Pick<File, "name" | "type" | "size">): ImageProblem {
  if (file.type === "image/svg+xml" || /\.svgz?$/i.test(file.name)) return "svg";
  if (!["image/png", "image/jpeg"].includes(file.type)) return "type";
  if (file.size > MAX_IMAGE_BYTES) return "size";
  return null;
}

export function useWatermarkPanel(files: LocalFile[]): ToolPanelView {
  const t = useTranslations("tool_watermark");
  const first = files[0];
  const pageCount = first?.pageCount ?? 0;
  const [mode, setMode] = useState<"text" | "image">("text");
  const [text, setText] = useState("CONFIDENTIAL");
  const [font, setFont] = useState<FontKey>("noto-sans");
  const [size, setSize] = useState(48);
  const [bold, setBold] = useState(true);
  const [color, setColor] = useState("#c62828");
  const [opacity, setOpacity] = useState(0.3);
  const [rotation, setRotation] = useState(45);
  const [image, setImage] = useState<WatermarkImage | null>(null);
  const [imageProblem, setImageProblem] = useState<ImageProblem>(null);
  const [imageScale, setImageScale] = useState(40);
  const [position, setPosition] = useState<Anchor>("middle-center");
  const [margin, setMargin] = useState(36);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [layout, setLayout] = useState<"single" | "tiled">("single");
  const [spacing, setSpacing] = useState(72);
  const [layer, setLayer] = useState<"over" | "under">("over");
  const [pages, setPages] = useState("");
  const [parity, setParity] = useState<"all" | "odd" | "even">("all");
  const [skipFirst, setSkipFirst] = useState(false);

  useEffect(() => () => (image ? URL.revokeObjectURL(image.url) : undefined), [image]);

  const pagesInvalid = Boolean(pages.trim() && pageCount && !parsePageSet(pages, pageCount));
  const anchorLabels = Object.fromEntries(
    ANCHORS.map((anchor) => [anchor, t(`anchors.${anchor}`)]),
  ) as Record<Anchor, string>;
  const firstSelected =
    !skipFirst &&
    parity !== "even" &&
    (!pages.trim() || !pageCount || Boolean(parsePageSet(pages, pageCount)?.has(0)));

  const problem =
    mode === "text" && !text.trim()
      ? t("textMissing")
      : mode === "image" && !image
        ? t("imageMissing")
        : pagesInvalid
          ? t("pagesInvalid")
          : null;

  const onImage = async (file: File | undefined) => {
    if (!file) return;
    const issue = imageProblemFor(file);
    setImageProblem(issue);
    if (issue) return;
    try {
      setImage(await readImage(file));
    } catch {
      setImageProblem("read");
    }
  };

  const preview =
    first && pageCount > 0 ? (
      <StampPreview
        fileId={first.uploadId}
        label={t("previewAlt", { name: first.name })}
        caption={firstSelected ? t("previewCaption") : t("previewSkipped")}
      >
        {({ page, scale }) => {
          if (!firstSelected) return null;
          const place = (box: PageSize) =>
            watermarkCenters(
              layout,
              position,
              page,
              box,
              rotation,
              margin,
              offsetX,
              offsetY,
              spacing,
            );
          if (mode === "image") {
            if (!image) return null;
            const width = (page.width * imageScale) / 100;
            const box = { width, height: (width * image.height) / Math.max(image.width, 1) };
            return place(box)
              .slice(0, 300)
              .map((center, index) => {
                const { left, top } = toScreen(center, page, scale);
                return (
                  <img
                    key={index}
                    src={image.url}
                    alt=""
                    data-preview-label
                    style={{
                      position: "absolute",
                      left,
                      top,
                      width: box.width * scale,
                      height: box.height * scale,
                      opacity,
                      transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                      maxWidth: "none",
                    }}
                  />
                );
              });
          }
          return text.trim() ? (
            <PlacedText
              text={text}
              style={{ font, size, bold, color, opacity, direction: "auto" }}
              scale={scale}
              page={page}
              rotation={rotation}
              place={place}
            />
          ) : null;
        }}
      </StampPreview>
    ) : null;

  return {
    main: preview,
    options: (
      <div className="flex flex-col gap-4" data-watermark-options>
        <ChoiceGroup
          legend={t("mode")}
          name="wm-mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: "text", label: t("modes.text") },
            { value: "image", label: t("modes.image") },
          ]}
        />
        {mode === "text" ? (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wm-text" className="text-sm font-medium">
                {t("text")}
              </label>
              <textarea
                id="wm-text"
                dir="auto"
                rows={2}
                maxLength={1000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                className="rounded-(--radius-control) border border-border-strong bg-surface p-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                id="wm-font"
                label={t("font")}
                value={font}
                onChange={setFont}
                options={FONT_KEYS.map((value) => ({ value, label: FONT_LABELS[value] }))}
              />
              <NumberInput
                id="wm-size"
                label={t("size")}
                value={size}
                min={4}
                max={1000}
                onChange={setSize}
              />
            </div>
            <div className="grid grid-cols-[auto_1fr] items-end gap-3">
              <ColorField id="wm-color" label={t("color")} value={color} onChange={setColor} />
              <ToggleRow
                id="wm-bold"
                label={t("bold")}
                description={t("boldHint")}
                checked={bold}
                onChange={setBold}
              />
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="wm-image" className="text-sm font-medium">
              {t("image")}
            </label>
            <input
              id="wm-image"
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => void onImage(event.target.files?.[0])}
              className="text-sm"
            />
            {image ? <p className="truncate text-xs text-muted">{image.name}</p> : null}
            {imageProblem ? (
              <p role="alert" className="text-xs font-medium text-danger">
                {t(`imageProblems.${imageProblem}`)}
              </p>
            ) : (
              <p className="text-xs text-muted">{t("imageHint")}</p>
            )}
            <RangeField
              id="wm-scale"
              label={t("scale")}
              value={imageScale}
              min={1}
              max={100}
              step={1}
              display={`${imageScale}%`}
              onChange={setImageScale}
            />
          </div>
        )}
        <RangeField
          id="wm-opacity"
          label={t("opacity")}
          value={opacity}
          min={0}
          max={1}
          step={0.05}
          display={`${Math.round(opacity * 100)}%`}
          onChange={setOpacity}
        />
        <RangeField
          id="wm-rotation"
          label={t("rotation")}
          value={rotation}
          min={-180}
          max={180}
          step={5}
          display={`${rotation}°`}
          onChange={setRotation}
        />
        <ChoiceGroup
          legend={t("layout")}
          name="wm-layout"
          value={layout}
          onChange={setLayout}
          options={[
            { value: "single", label: t("layouts.single") },
            { value: "tiled", label: t("layouts.tiled") },
          ]}
        />
        {layout === "single" ? (
          <>
            <PositionGrid
              legend={t("position")}
              value={position}
              onChange={setPosition}
              labels={anchorLabels}
            />
            <div className="grid grid-cols-3 gap-2">
              <NumberInput
                id="wm-margin"
                label={t("margin")}
                value={margin}
                min={0}
                max={2000}
                onChange={setMargin}
              />
              <NumberInput
                id="wm-offset-x"
                label={t("offsetX")}
                value={offsetX}
                min={-5000}
                max={5000}
                onChange={setOffsetX}
              />
              <NumberInput
                id="wm-offset-y"
                label={t("offsetY")}
                value={offsetY}
                min={-5000}
                max={5000}
                onChange={setOffsetY}
              />
            </div>
          </>
        ) : (
          <NumberInput
            id="wm-spacing"
            label={t("spacing")}
            value={spacing}
            min={0}
            max={5000}
            onChange={setSpacing}
          />
        )}
        <ChoiceGroup
          legend={t("layer")}
          name="wm-layer"
          value={layer}
          onChange={setLayer}
          options={[
            { value: "over", label: t("layers.over") },
            { value: "under", label: t("layers.under") },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor="wm-pages" className="text-sm font-medium">
            {t("pages")}
          </label>
          <Input
            id="wm-pages"
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
          name="wm-parity"
          value={parity}
          onChange={setParity}
          options={[
            { value: "all", label: t("parities.all") },
            { value: "odd", label: t("parities.odd") },
            { value: "even", label: t("parities.even") },
          ]}
        />
        <ToggleRow
          id="wm-skip-first"
          label={t("skipFirst")}
          description={t("skipFirstHint")}
          checked={skipFirst}
          onChange={setSkipFirst}
        />
      </div>
    ),
    payload: {
      mode,
      text,
      font,
      size,
      bold,
      color,
      image_data: mode === "image" ? (image?.data ?? null) : null,
      image_scale: imageScale,
      opacity,
      rotation,
      position,
      margin,
      offset_x: offsetX,
      offset_y: offsetY,
      layout,
      spacing,
      layer,
      pages: pages.trim() || null,
      parity,
      skip_first: skipFirst,
    },
    problem,
    summary:
      files.length > 1
        ? t("summaryBatch", { count: files.length })
        : layout === "tiled"
          ? t("summaryTiled")
          : t("summarySingle"),
  };
}
