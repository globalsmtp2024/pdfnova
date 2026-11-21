import { ImageResponse } from "next/og";

import { brand } from "@/config/brand";

export const alt = brand.tagline;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: 72,
        background: "linear-gradient(130deg, #5B4BFF 0%, #7C3AED 55%, #12B5A6 100%)",
        color: "white",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: 20, fontSize: 40, fontWeight: 700 }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 18,
            background: "rgba(255,255,255,0.95)",
            display: "flex",
          }}
        />
        {brand.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ fontSize: 76, fontWeight: 800, lineHeight: 1.05, letterSpacing: -2 }}>
          {brand.tagline}
        </div>
        <div style={{ fontSize: 32, opacity: 0.9 }}>
          Free PDF and document tools. Private, fast, no sign-up.
        </div>
      </div>
    </div>,
    size,
  );
}
