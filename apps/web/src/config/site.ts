import { brand } from "@/config/brand";

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export const siteUrl = clean(process.env.NEXT_PUBLIC_SITE_URL) ?? `https://${brand.domain}`;

export const announcement = {
  message: clean(process.env.NEXT_PUBLIC_ANNOUNCEMENT),
  href: clean(process.env.NEXT_PUBLIC_ANNOUNCEMENT_HREF),
  id: clean(process.env.NEXT_PUBLIC_ANNOUNCEMENT_ID) ?? "default",
};

export const donationLinks = [
  { id: "githubSponsors", href: clean(process.env.NEXT_PUBLIC_DONATE_GITHUB_SPONSORS) },
  { id: "buyMeACoffee", href: clean(process.env.NEXT_PUBLIC_DONATE_BUY_ME_A_COFFEE) },
  { id: "kofi", href: clean(process.env.NEXT_PUBLIC_DONATE_KOFI) },
].filter((link): link is { id: "githubSponsors" | "buyMeACoffee" | "kofi"; href: string } =>
  Boolean(link.href),
);

export const supportEnabled = donationLinks.length > 0;

export const socialLinks = [
  { id: "github", label: "GitHub", href: clean(process.env.NEXT_PUBLIC_SOCIAL_GITHUB) },
  { id: "x", label: "X", href: clean(process.env.NEXT_PUBLIC_SOCIAL_X) },
  { id: "linkedin", label: "LinkedIn", href: clean(process.env.NEXT_PUBLIC_SOCIAL_LINKEDIN) },
  { id: "youtube", label: "YouTube", href: clean(process.env.NEXT_PUBLIC_SOCIAL_YOUTUBE) },
].filter((link): link is { id: string; label: string; href: string } => Boolean(link.href));
