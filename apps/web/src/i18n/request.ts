import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";

import { routing } from "@/i18n/routing";
import en from "../../messages/en.json";

type Messages = Record<string, unknown>;

function isRecord(value: unknown): value is Messages {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeMessages(base: Messages, override: Messages): Messages {
  const result: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = result[key];
    result[key] = isRecord(existing) && isRecord(value) ? mergeMessages(existing, value) : value;
  }
  return result;
}

export async function loadMessages(locale: string): Promise<Messages> {
  if (locale === routing.defaultLocale) return en;
  const localized = (await import(`../../messages/${locale}.json`)) as { default: Messages };
  return mergeMessages(en, localized.default);
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: "UTC",
  };
});
