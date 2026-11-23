import {
  Activity,
  BookOpen,
  Code2,
  FileClock,
  Info,
  Layers,
  LifeBuoy,
  ListChecks,
  ShieldCheck,
  Sparkles,
  Workflow,
  type LucideIcon,
} from "lucide-react";

export type NavLink = { id: string; href: string; icon: LucideIcon };

export const DEVELOPER_LINKS: NavLink[] = [
  { id: "developers", href: "/developers", icon: Code2 },
  { id: "api", href: "/developers/api", icon: BookOpen },
  { id: "workflows", href: "/workflows", icon: Workflow },
  { id: "status", href: "/status", icon: Activity },
];

export const RESOURCE_LINKS: NavLink[] = [
  { id: "features", href: "/features", icon: Sparkles },
  { id: "howItWorks", href: "/how-it-works", icon: Layers },
  { id: "security", href: "/security", icon: ShieldCheck },
  { id: "blog", href: "/blog", icon: BookOpen },
  { id: "help", href: "/help", icon: LifeBuoy },
  { id: "changelog", href: "/changelog", icon: FileClock },
  { id: "about", href: "/about", icon: Info },
  { id: "compare", href: "/compare", icon: ListChecks },
];

export const STATIC_PAGES = [
  "/",
  "/tools",
  "/features",
  "/how-it-works",
  "/security",
  "/solutions",
  "/workflows",
  "/developers",
  "/developers/api",
  "/blog",
  "/help",
  "/contact",
  "/about",
  "/changelog",
  "/roadmap",
  "/status",
  "/compare",
  "/shortcuts",
  "/accessibility",
  "/legal/terms",
  "/legal/privacy",
  "/legal/cookies",
  "/legal/acceptable-use",
] as const;
