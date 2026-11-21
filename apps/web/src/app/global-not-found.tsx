import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { brand } from "@/config/brand";

import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: `Page not found · ${brand.name}`,
  robots: { index: false },
};

export default function GlobalNotFound() {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col items-center justify-center gap-5 px-4 text-center">
        <p className="font-mono text-sm font-semibold text-primary">404</p>
        <h1 className="text-h1 font-bold">This page took a wrong turn</h1>
        <p className="max-w-md text-muted">
          The page you’re looking for doesn’t exist or has moved. Your files are safe.
        </p>
        <a
          href="/"
          className="inline-flex h-11 items-center rounded-(--radius-control) bg-primary px-5 text-sm font-medium text-white"
        >
          Go home
        </a>
      </body>
    </html>
  );
}
