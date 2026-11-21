import { Link } from "@/i18n/navigation";

import { brand } from "@/config/brand";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden>
      <defs>
        <linearGradient id="logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B4BFF" />
          <stop offset="0.55" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#12B5A6" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#logo-gradient)" />
      <path
        d="M10 8.5h8.2l5.3 5.3V23a1.5 1.5 0 0 1-1.5 1.5H10A1.5 1.5 0 0 1 8.5 23V10A1.5 1.5 0 0 1 10 8.5Z"
        fill="white"
        fillOpacity="0.95"
      />
      <path
        d="M18 8.5v4.3c0 .55.45 1 1 1h4.5"
        fill="none"
        stroke="#5B4BFF"
        strokeOpacity="0.35"
        strokeWidth="1.2"
      />
      <path d="m16 14.5 1.1 2.4 2.4 1.1-2.4 1.1L16 21.5l-1.1-2.4-2.4-1.1 2.4-1.1Z" fill="#5B4BFF" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        "flex items-center gap-2.5 rounded-lg font-display text-lg font-bold tracking-tight",
        className,
      )}
      aria-label={`${brand.name} home`}
    >
      <LogoMark />
      <span>{brand.name}</span>
    </Link>
  );
}
