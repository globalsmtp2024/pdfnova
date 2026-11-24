import {
  Activity,
  ChartColumn,
  Flag,
  LayoutDashboard,
  Siren,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = { href: string; key: string; icon: LucideIcon };

export const ADMIN_NAV: AdminNavItem[] = [
  { href: "/admin", key: "dashboard", icon: LayoutDashboard },
  { href: "/admin/users", key: "users", icon: Users },
  { href: "/admin/tools", key: "tools", icon: ChartColumn },
  { href: "/admin/jobs", key: "jobs", icon: Wrench },
  { href: "/admin/reports", key: "reports", icon: Siren },
  { href: "/admin/settings", key: "settings", icon: Flag },
  { href: "/admin/system", key: "system", icon: Activity },
];
