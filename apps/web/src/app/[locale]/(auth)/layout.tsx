import { CircleCheck } from "lucide-react";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { AuthIllustration } from "@/components/illustrations";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export default async function AuthLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const points = [t("home.trust.free"), t("home.trust.noSignup"), t("home.trust.autoDelete")];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative isolate hidden overflow-hidden bg-cta-gradient p-10 text-white lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute inset-0 -z-10 bg-dots mask-radial opacity-30" />
        <div
          aria-hidden
          className="absolute -end-24 -bottom-24 -z-10 size-96 rounded-full bg-accent/40 blur-3xl"
        />
        <Logo className="text-white" />
        <div className="flex flex-col gap-6">
          <AuthIllustration className="max-w-sm" />
          <h2 className="max-w-md text-h1 font-bold tracking-tight">{t("auth.panelTitle")}</h2>
          <p className="max-w-md text-white/85">{t("auth.panelBody")}</p>
          <ul className="flex flex-col gap-2">
            {points.map((point) => (
              <li key={point} className="flex items-center gap-2 text-sm">
                <CircleCheck className="size-4" aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <span />
      </aside>
      <div className="relative flex flex-col">
        <header className="flex h-16 items-center justify-between px-6">
          <span className="lg:invisible">
            <Logo />
          </span>
          <ThemeToggle />
        </header>
        <main id="main" tabIndex={-1} className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-12">
          <div className="w-full max-w-md">{children}</div>
        </main>
      </div>
    </div>
  );
}
