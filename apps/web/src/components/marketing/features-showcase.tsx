import { ArrowRight, Check } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localizedFeatures } from "@/content/pages";

const PROOF_KEYS = ["noPlans", "noWatermarks", "noAccount"] as const;

export async function FeaturesShowcase() {
  const locale = await getLocale();
  const t = await getTranslations("featuresShowcase");
  const common = await getTranslations("common");
  const [free, ...rest] = localizedFeatures(locale);
  return (
    <div className="flex flex-col gap-4">
      <div className="gradient-border relative overflow-hidden rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft">
        <div
          aria-hidden
          className="pointer-events-none absolute -end-20 -top-20 size-56 rounded-full opacity-20 blur-3xl"
          style={{ background: free.color }}
        />
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <span
              className="flex size-14 shrink-0 items-center justify-center rounded-2xl text-white shadow-lifted"
              style={{ background: free.color }}
            >
              <free.icon className="size-7" aria-hidden />
            </span>
            <div>
              <h3 className="text-h3 font-semibold">
                <span className="text-gradient-animated font-display font-extrabold">100%</span>{" "}
                {free.title}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-muted">{free.body}</p>
            </div>
          </div>
          <ul className="flex flex-wrap gap-2 md:justify-end">
            {PROOF_KEYS.map((key) => (
              <li
                key={key}
                className="flex items-center gap-1.5 rounded-full border border-success/30 bg-success-subtle px-3 py-1 text-xs font-medium text-success-strong"
              >
                <Check className="size-3.5" aria-hidden />
                {t(key)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((feature) => (
          <li key={feature.title} className="flex">
            <div className="gradient-border group relative flex w-full flex-col gap-3 rounded-(--radius-card) border border-border bg-surface p-6 shadow-soft transition-[transform,box-shadow] duration-300 ease-(--ease-spring) hover:-translate-y-0.5 hover:shadow-lifted">
              <span
                className="flex size-11 items-center justify-center rounded-xl text-white shadow-lifted"
                style={{
                  background: `linear-gradient(135deg, ${feature.color}, color-mix(in srgb, ${feature.color} 55%, #0b0d17))`,
                }}
              >
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h3 className="text-h3 font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted">{feature.body}</p>
              <Link
                href={feature.href}
                className="mt-auto inline-flex w-fit items-center gap-1 pt-1 text-sm font-semibold text-primary hover:underline"
              >
                {common("learnMore")}
                <span className="sr-only"> — {feature.title}</span>
                <ArrowRight
                  className="flip-rtl size-4 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
