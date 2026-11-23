import { describe, expect, it } from "vitest";

import { LIVE_TOOL_SLUGS } from "@/config/live";
import { getToolContent, LOCALIZED_CONTENT } from "@/content/tools-content";

const LATIN_ONLY = /^[\s\x20-\x7E]*$/;

describe("tool content for live tools", () => {
  for (const slug of LIVE_TOOL_SLUGS) {
    it(`${slug} has English content`, () => {
      const content = getToolContent(slug, "en");
      expect(content).not.toBeNull();
      expect(content?.steps).toHaveLength(3);
      expect(content?.highlights.length).toBeGreaterThanOrEqual(3);
      expect(content?.faq.length).toBeGreaterThanOrEqual(3);
    });

    it(`${slug} has complete Urdu content`, () => {
      const urdu = getToolContent(slug, "ur");
      expect(urdu, `Missing Urdu content for live tool "${slug}"`).not.toBeNull();
      if (!urdu) return;
      expect(urdu.steps).toHaveLength(3);
      const specific = LOCALIZED_CONTENT.ur[slug];
      if (specific) {
        const english = getToolContent(slug, "en");
        expect(urdu.highlights.length).toBe(english?.highlights.length);
        expect(urdu.faq.length).toBe(english?.faq.length);
      }
      const texts = [
        ...urdu.steps,
        ...urdu.highlights.flatMap((item) => [item.title, item.body]),
        ...urdu.faq.flatMap((item) => [item.question, item.answer]),
      ];
      for (const text of texts) {
        expect(text.trim().length).toBeGreaterThan(0);
        expect(LATIN_ONLY.test(text), `Untranslated Urdu text for ${slug}: ${text}`).toBe(false);
      }
    });
  }
});
