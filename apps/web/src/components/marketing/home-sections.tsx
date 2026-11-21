import {
  Accessibility,
  Bot,
  Clock,
  Code2,
  Download,
  Gift,
  Keyboard,
  Languages,
  Layers,
  Lock,
  MousePointerClick,
  ShieldCheck,
  Trash2,
  Upload,
  WifiOff,
  Workflow,
  Zap,
} from "lucide-react";
import { getTranslations } from "next-intl/server";

import { SmartDropzone } from "@/components/marketing/hero";
import { DemoStrip, QuickActions, UseCasesCarousel } from "@/components/marketing/home-client";
import { ToolGrid } from "@/components/marketing/tool-grid";
import { ShieldIllustration, WorkflowIllustration } from "@/components/illustrations";
import { Accordion } from "@/components/ui/accordion";
import { MeshBackground } from "@/components/ui/backgrounds";
import { Badge } from "@/components/ui/badge";
import { BentoGrid, FeatureCard } from "@/components/ui/blocks";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { Section, SectionHeader } from "@/components/ui/section";
import { TOOL_CATEGORIES, TOOLS } from "@/config/tools";
import { mergeSamples } from "@/content/api-samples";
import { WORKFLOWS } from "@/content/workflows";
import { Link } from "@/i18n/navigation";

export async function QuickActionsSection() {
  const t = await getTranslations("home.quick");
  return (
    <Section aria-labelledby="quick-heading" className="pt-4 sm:pt-6">
      <SectionHeader
        id="quick-heading"
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <div className="mt-8">
        <QuickActions />
      </div>
    </Section>
  );
}

export async function ToolGridSection() {
  const t = await getTranslations("home.grid");
  return (
    <Section id="tools" tone="surface" aria-labelledby="grid-heading">
      <SectionHeader
        id="grid-heading"
        eyebrow={t("eyebrow")}
        title={t("title")}
        subtitle={t("subtitle", { count: TOOLS.length, categories: TOOL_CATEGORIES.length })}
      />
      <div className="mt-8">
        <ToolGrid />
      </div>
    </Section>
  );
}

export async function BentoSection() {
  const t = await getTranslations("home.bento");
  const later = <Badge>{t("comingLater")}</Badge>;
  return (
    <Section aria-labelledby="bento-heading">
      <SectionHeader id="bento-heading" eyebrow={t("eyebrow")} title={t("title")} align="center" />
      <BentoGrid className="mt-10">
        <FeatureCard
          icon={Gift}
          title={t("free.title")}
          body={t("free.body")}
          color="#5B4BFF"
          className="sm:col-span-2 lg:row-span-2"
          visual={
            <div className="text-gradient-animated font-display text-7xl font-extrabold">100%</div>
          }
        />
        <FeatureCard icon={Zap} title={t("speed.title")} body={t("speed.body")} color="#F59E0B" />
        <FeatureCard
          icon={ShieldCheck}
          title={t("privacy.title")}
          body={t("privacy.body")}
          color="#10B981"
        />
        <FeatureCard
          icon={Layers}
          title={t("batch.title")}
          body={t("batch.body")}
          color="#12B5A6"
        />
        <FeatureCard icon={Code2} title={t("api.title")} body={t("api.body")} color="#2F80ED" />
        <FeatureCard
          icon={WifiOff}
          title={t("offline.title")}
          body={t("offline.body")}
          color="#EC4899"
          badge={later}
        />
        <FeatureCard
          icon={Bot}
          title={t("ai.title")}
          body={t("ai.body")}
          color="#8B5CF6"
          badge={later}
        />
        <FeatureCard
          icon={Workflow}
          title={t("workflows.title")}
          body={t("workflows.body")}
          color="#F97316"
          badge={later}
          className="sm:col-span-2"
        />
      </BentoGrid>
    </Section>
  );
}

export async function HowItWorksSection() {
  const t = await getTranslations("home.how");
  const steps = [
    { id: "upload", icon: Upload },
    { id: "choose", icon: MousePointerClick },
    { id: "download", icon: Download },
  ];
  return (
    <Section tone="surface" aria-labelledby="how-heading">
      <SectionHeader id="how-heading" eyebrow={t("eyebrow")} title={t("title")} align="center" />
      <div className="relative mt-12">
        <svg
          aria-hidden
          viewBox="0 0 1000 40"
          preserveAspectRatio="none"
          className="absolute inset-x-[16%] top-8 hidden h-10 w-[68%] md:block"
        >
          <path
            d="M0 20 C 250 -10, 250 50, 500 20 S 750 -10, 1000 20"
            fill="none"
            stroke="var(--primary)"
            strokeOpacity="0.5"
            strokeWidth="2"
            className="animate-beam"
          />
        </svg>
        <Reveal as="ol" className="relative grid gap-8 md:grid-cols-3">
          {steps.map((step, index) => (
            <RevealItem
              key={step.id}
              as="li"
              className="flex flex-col items-center gap-3 text-center"
            >
              <span className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-background shadow-lifted">
                <step.icon className="size-7 text-primary" aria-hidden />
                <span className="absolute -end-2 -top-2 flex size-6 items-center justify-center rounded-full bg-cta-gradient text-xs font-bold text-white">
                  {index + 1}
                </span>
              </span>
              <h3 className="text-h3 font-semibold">{t(`steps.${step.id}.title`)}</h3>
              <p className="max-w-xs text-sm text-muted">{t(`steps.${step.id}.body`)}</p>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

export async function PrivacySection() {
  const t = await getTranslations("home.privacy");
  const steps = [
    { id: "upload", icon: Lock, time: "0s" },
    { id: "process", icon: ShieldCheck, time: "≤ 5 min" },
    { id: "download", icon: Download, time: "15 min" },
    { id: "delete", icon: Trash2, time: "1 h" },
  ];
  return (
    <Section aria-labelledby="privacy-heading">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex flex-col gap-6">
          <SectionHeader
            id="privacy-heading"
            eyebrow={t("eyebrow")}
            title={t("title")}
            subtitle={t("subtitle")}
          />
          <ShieldIllustration className="mx-auto max-w-56" />
          <Button asChild variant="outline" className="w-fit">
            <Link href="/security">{t("cta")}</Link>
          </Button>
        </div>
        <Reveal as="ol" className="relative flex flex-col gap-4">
          <span
            aria-hidden
            className="absolute start-6 top-6 bottom-6 w-px bg-gradient-to-b from-primary via-accent to-success"
          />
          {steps.map((step) => (
            <RevealItem
              key={step.id}
              as="li"
              className="relative flex gap-4 rounded-(--radius-card) border border-border bg-surface p-5 shadow-soft"
            >
              <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                <step.icon className="size-5" aria-hidden />
              </span>
              <div className="flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold">{t(`steps.${step.id}.title`)}</h3>
                  <span className="flex items-center gap-1 font-mono text-xs text-muted" dir="ltr">
                    <Clock className="size-3" aria-hidden />
                    {step.time}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted">{t(`steps.${step.id}.body`)}</p>
              </div>
            </RevealItem>
          ))}
        </Reveal>
      </div>
    </Section>
  );
}

export async function DemoSection() {
  const t = await getTranslations("home.demo");
  return (
    <Section tone="muted" aria-labelledby="demo-heading">
      <SectionHeader id="demo-heading" eyebrow={t("eyebrow")} title={t("title")} />
      <div className="mt-10">
        <DemoStrip />
      </div>
    </Section>
  );
}

export async function UseCasesSection() {
  const t = await getTranslations("home.useCases");
  return (
    <Section aria-labelledby="usecases-heading">
      <SectionHeader id="usecases-heading" eyebrow={t("eyebrow")} title={t("title")} />
      <div className="mt-6">
        <UseCasesCarousel />
      </div>
    </Section>
  );
}

export async function WorkflowsTeaser() {
  const t = await getTranslations("home.workflows");
  const toolT = await getTranslations("tools");
  const recipe = WORKFLOWS[0];
  const labels = recipe.steps.map((step) => {
    const tool = TOOLS.find((entry) => entry.slug === step.tool);
    return tool
      ? toolT.has(`${tool.slug}.name`)
        ? toolT(`${tool.slug}.name`)
        : tool.name
      : step.tool;
  });
  return (
    <Section tone="surface" aria-labelledby="workflows-heading">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <SectionHeader
          id="workflows-heading"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <Button asChild variant="outline">
              <Link href="/workflows">{t("cta")}</Link>
            </Button>
          }
        />
        <div className="rounded-(--radius-card) border border-border bg-background p-6 shadow-lifted">
          <WorkflowIllustration labels={labels} />
        </div>
      </div>
    </Section>
  );
}

export async function DevelopersTeaser() {
  const t = await getTranslations("home.developers");
  return (
    <Section aria-labelledby="dev-heading">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.2fr]">
        <SectionHeader
          id="dev-heading"
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
          actions={
            <Button asChild variant="outline">
              <Link href="/developers/api">{t("cta")}</Link>
            </Button>
          }
        />
        <CodeBlock samples={mergeSamples()} title="Merge two PDFs" />
      </div>
    </Section>
  );
}

export async function LanguagesStrip() {
  const t = await getTranslations("home.languages");
  return (
    <section className="border-y border-border bg-surface">
      <div className="container-page flex flex-col items-center gap-4 py-10 text-center md:flex-row md:text-start">
        <div className="flex gap-2 text-primary">
          <Accessibility className="size-7" aria-hidden />
          <Keyboard className="size-7" aria-hidden />
          <Languages className="size-7" aria-hidden />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold">{t("title")}</h2>
          <p className="text-muted">{t("body")}</p>
        </div>
      </div>
    </section>
  );
}

export async function FaqSection() {
  const t = await getTranslations("home.faq");
  const ids = ["free", "account", "retention", "safe", "limits", "interrupted"];
  return (
    <Section aria-labelledby="faq-heading">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr]">
        <SectionHeader id="faq-heading" eyebrow={t("eyebrow")} title={t("title")} />
        <Accordion
          items={ids.map((id) => ({
            id,
            question: t(`items.${id}.q`),
            answer: t(`items.${id}.a`),
          }))}
        />
      </div>
    </Section>
  );
}

export async function FinalCta() {
  const t = await getTranslations("home.cta");
  return (
    <section className="relative isolate overflow-hidden py-20 sm:py-28">
      <MeshBackground pattern="dots" />
      <div className="container-page flex max-w-3xl flex-col items-center gap-6 text-center">
        <h2 className="text-display font-extrabold tracking-tight">
          <span className="text-gradient-animated">{t("title")}</span>
        </h2>
        <p className="text-lg text-muted">{t("subtitle")}</p>
        <div className="w-full">
          <SmartDropzone size="compact" />
        </div>
      </div>
    </section>
  );
}
