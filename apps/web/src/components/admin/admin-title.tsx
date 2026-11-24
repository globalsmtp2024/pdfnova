import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export async function adminMetadata(locale: string, key: string): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: "adminPanel" });
  return { title: `${t("prefix")} · ${t(`nav.${key}`)}`, robots: { index: false, follow: false } };
}

export async function AdminTitle({ navKey }: { navKey: string }) {
  const t = await getTranslations("adminPanel");
  return (
    <h1 className="font-display text-2xl font-semibold">
      <span className="text-primary">{t("prefix")}</span> · {t(`nav.${navKey}`)}
    </h1>
  );
}
