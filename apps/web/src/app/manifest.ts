import type { MetadataRoute } from "next";

import { brand } from "@/config/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.name,
    description: brand.tagline,
    id: "/",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#FAFAFC",
    theme_color: "#5B4BFF",
    categories: ["productivity", "utilities"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Merge PDF", url: "/tools/merge" },
      { name: "Compress PDF", url: "/tools/compress" },
      { name: "Image to PDF", url: "/tools/image-to-pdf" },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: {
        title: "title",
        text: "text",
        url: "url",
        files: [
          {
            name: "files",
            accept: [
              "application/pdf",
              "image/*",
              ".docx",
              ".xlsx",
              ".pptx",
              ".txt",
              ".md",
              ".html",
            ],
          },
        ],
      },
    },
  };
}
