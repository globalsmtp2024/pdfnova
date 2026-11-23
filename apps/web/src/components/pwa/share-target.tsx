"use client";

import { Share2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { ToolIcon } from "@/components/tools/tool-icon";
import { findTool, suggestTools, type FileKind } from "@/config/tools";
import { Link } from "@/i18n/navigation";
import { toolText } from "@/lib/tool-text";
import { usePendingFiles } from "@/stores/pending-files";

const SHARE_CACHE = "pdfnova-share";
const EXTENSION_KINDS: Record<string, FileKind> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  webp: "image",
  tif: "image",
  tiff: "image",
  gif: "image",
  bmp: "image",
  docx: "word",
  xlsx: "excel",
  pptx: "powerpoint",
  txt: "text",
  md: "text",
  html: "html",
};

function kindOf(file: File): FileKind | null {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (file.type.startsWith("image/")) return "image";
  return EXTENSION_KINDS[extension] ?? null;
}

async function readShared(): Promise<File[]> {
  if (!("caches" in window)) return [];
  const cache = await caches.open(SHARE_CACHE);
  const files: File[] = [];
  for (const request of await cache.keys()) {
    const response = await cache.match(request);
    if (!response) continue;
    const name = decodeURIComponent(response.headers.get("X-Filename") ?? "shared-file");
    files.push(new File([await response.blob()], name, { type: response.headers.get("Content-Type") ?? "" }));
    await cache.delete(request);
  }
  return files;
}

export function ShareTarget() {
  const t = useTranslations("share");
  const toolT = useTranslations("tools");
  const [state, setState] = useState<{ files: File[]; loaded: boolean }>({ files: [], loaded: false });
  const setPending = usePendingFiles((store) => store.setFiles);

  useEffect(() => {
    let cancelled = false;
    void readShared().then((files) => {
      if (cancelled) return;
      setPending(files);
      setState({ files, loaded: true });
    });
    return () => {
      cancelled = true;
    };
  }, [setPending]);

  const kinds = state.files.map(kindOf).filter((kind): kind is FileKind => kind !== null);
  const suggestions = suggestTools(kinds, state.files.length);

  if (!state.loaded) return null;
  if (!state.files.length) {
    return (
      <p className="text-muted" data-share-empty>
        {t("nothing")}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-4" data-share-ready>
      <p className="flex items-center gap-2 font-medium">
        <Share2 className="size-5 text-primary" aria-hidden />
        {t("received", { count: state.files.length })}
      </p>
      <ul className="text-sm text-muted">
        {state.files.map((file) => (
          <li key={`${file.name}-${file.size}`}>{file.name}</li>
        ))}
      </ul>
      <p className="text-sm font-medium">{t("chooseTool")}</p>
      <ul className="flex flex-wrap gap-2">
        {suggestions.map((tool) => (
          <li key={tool.slug}>
            <Link
              href={`/tools/${tool.slug}`}
              className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1.5 text-sm hover:border-primary/50"
            >
              <ToolIcon slug={tool.slug} size="sm" />
              {toolText(toolT, findTool(tool.slug) ?? tool).name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
