"use client";

import { Search } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

import { Accordion } from "@/components/ui/accordion";
import { EmptyState } from "@/components/ui/blocks";
import { Input } from "@/components/ui/input";
import { localizedHelpTopics } from "@/content/pages";

export function HelpCenter() {
  const t = useTranslations("common");
  const page = useTranslations("sitePages.help");
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const topics = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return localizedHelpTopics(locale)
      .map((topic) => ({
        ...topic,
        items: topic.items.filter((item) => {
          const haystack = `${item.question} ${item.answer} ${topic.title}`.toLowerCase();
          return words.every((word) => haystack.includes(word));
        }),
      }))
      .filter((topic) => topic.items.length > 0);
  }, [query, locale]);
  return (
    <div className="flex flex-col gap-10">
      <div className="relative mx-auto w-full max-w-2xl">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-5 -translate-y-1/2 text-muted"
          aria-hidden
        />
        <Input
          type="search"
          placeholder={page("searchPlaceholder")}
          aria-label={t("search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-14 ps-12 text-base shadow-lifted"
          data-help-search
        />
      </div>
      {topics.length === 0 ? (
        <EmptyState icon={Search} title={page("noMatch", { query })} body={page("noMatchBody")} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {topics.map((topic) => (
            <section
              key={topic.id}
              aria-labelledby={`help-${topic.id}`}
              className="flex flex-col gap-3"
            >
              <h2
                id={`help-${topic.id}`}
                className="flex items-center gap-2 font-display text-lg font-semibold"
              >
                <topic.icon className="size-5 text-primary" aria-hidden />
                {topic.title}
              </h2>
              <Accordion
                items={topic.items.map((item, index) => ({
                  id: `${topic.id}-${index}`,
                  question: item.question,
                  answer: item.answer,
                }))}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
