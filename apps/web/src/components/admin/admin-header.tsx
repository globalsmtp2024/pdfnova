"use client";

import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Search,
  ShieldCheck,
  UserCog,
  Users as UsersIcon,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ADMIN_NAV } from "@/components/admin/admin-nav";
import { Avatar, Pill } from "@/components/admin/admin-ui";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { TOOLS } from "@/config/tools";
import { Link, useRouter } from "@/i18n/navigation";
import { useAdminUsers } from "@/lib/admin";
import { useLogout, useSession } from "@/lib/session";
import { cn } from "@/lib/utils";

type Result = {
  id: string;
  group: "pages" | "users" | "tools";
  label: string;
  sub?: string;
  href: string;
  icon: LucideIcon;
  name?: string;
};

function useDebounced(value: string, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

function useOutsideClose(
  open: boolean,
  close: () => void,
  ref: React.RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, ref]);
}

export function AdminSearch() {
  const t = useTranslations("adminPanel");
  const search = useTranslations("adminPanel.search");
  const tools = useTranslations("tools");
  const router = useRouter();
  const listId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(query.trim());
  const people = useAdminUsers(debounced.length >= 2 ? debounced : "");
  useOutsideClose(open, () => setOpen(false), box);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = useMemo<Result[]>(() => {
    const needle = query.trim().toLowerCase();
    const pages: Result[] = ADMIN_NAV.filter(
      (item) => !needle || t(`nav.${item.key}`).toLowerCase().includes(needle),
    ).map((item) => ({
      id: `page-${item.key}`,
      group: "pages",
      label: t(`nav.${item.key}`),
      href: item.href,
      icon: item.icon,
    }));
    if (!needle) return pages;
    const matchedTools: Result[] = TOOLS.filter((tool) => {
      const name = tools.has(`${tool.slug}.name`) ? tools(`${tool.slug}.name`) : tool.name;
      return name.toLowerCase().includes(needle) || tool.slug.includes(needle);
    })
      .slice(0, 4)
      .map((tool) => ({
        id: `tool-${tool.slug}`,
        group: "tools",
        label: tools.has(`${tool.slug}.name`) ? tools(`${tool.slug}.name`) : tool.name,
        sub: tool.slug,
        href: "/admin/tools",
        icon: Wrench,
      }));
    const matchedUsers: Result[] = (debounced.length >= 2 ? (people.data ?? []) : [])
      .slice(0, 5)
      .map((user) => ({
        id: `user-${user.id}`,
        group: "users",
        label: user.display_name || user.email,
        sub: user.email,
        href: `/admin/users?user=${user.id}`,
        icon: UsersIcon,
        name: user.display_name || user.email,
      }));
    return [...matchedUsers, ...pages, ...matchedTools];
  }, [query, debounced, people.data, t, tools]);

  const go = (result: Result | undefined) => {
    if (!result) return;
    setOpen(false);
    setQuery("");
    router.push(result.href);
  };

  const groups: Result["group"][] = ["users", "pages", "tools"];
  let index = -1;
  return (
    <div ref={box} className="relative w-full max-w-md" role="search">
      <Search
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted"
        aria-hidden
      />
      <input
        ref={input}
        type="search"
        value={query}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={search("label")}
        placeholder={search("placeholder")}
        autoComplete="off"
        enterKeyHint="search"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((value) => Math.min(value + 1, results.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((value) => Math.max(value - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            go(results[active]);
          }
        }}
        className="h-10 w-full rounded-full border border-border-strong bg-surface-muted/60 ps-10 pe-16 text-sm transition-colors outline-none placeholder:text-muted/70 focus-visible:border-primary focus-visible:bg-surface focus-visible:ring-4 focus-visible:ring-primary/15"
        data-admin-search
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 rounded-md border border-border bg-surface px-1.5 py-0.5 text-[10px] font-medium text-muted max-sm:hidden"
        dir="ltr"
      >
        Ctrl K
      </kbd>
      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-12 z-40 max-h-96 overflow-y-auto rounded-xl border border-border bg-surface p-2 shadow-floating"
        >
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">{search("none")}</p>
          ) : (
            groups.map((group) => {
              const items = results.filter((entry) => entry.group === group);
              if (items.length === 0) return null;
              return (
                <div key={group} className="flex flex-col gap-0.5 pb-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-muted uppercase">
                    {search(`group.${group}`)}
                  </p>
                  {items.map((result) => {
                    index += 1;
                    const position = index;
                    return (
                      <button
                        key={result.id}
                        type="button"
                        role="option"
                        aria-selected={active === position}
                        onMouseEnter={() => setActive(position)}
                        onClick={() => go(result)}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-start text-sm",
                          active === position ? "bg-primary-subtle" : "hover:bg-surface-muted",
                        )}
                      >
                        {result.group === "users" ? (
                          <Avatar name={result.name ?? result.label} size="sm" />
                        ) : (
                          <span className="flex size-8 items-center justify-center rounded-lg bg-surface-muted text-primary">
                            <result.icon className="size-4" aria-hidden />
                          </span>
                        )}
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium">{result.label}</span>
                          {result.sub ? (
                            <span className="truncate text-xs text-muted" dir="ltr">
                              {result.sub}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export function AdminProfileMenu() {
  const t = useTranslations("adminPanel");
  const session = useSession();
  const router = useRouter();
  const logout = useLogout();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useOutsideClose(open, () => setOpen(false), box);
  const user = session.data;
  if (!user) return null;
  const name = user.display_name || user.email;
  const signOut = () =>
    logout.mutate(undefined, { onSettled: () => router.replace("/admin/login") });
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 ps-1 pe-2.5 transition-colors hover:bg-surface-muted focus-visible:ring-4 focus-visible:ring-primary/20 focus-visible:outline-none"
        data-admin-profile
      >
        <Avatar name={name} size="sm" />
        <span className="max-w-32 truncate text-sm font-medium max-md:hidden">{name}</span>
        <ChevronDown className="size-4 text-muted" aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute end-0 top-12 z-40 flex w-72 flex-col gap-1 rounded-xl border border-border bg-surface p-2 shadow-floating"
        >
          <div className="flex items-center gap-3 rounded-lg bg-surface-muted p-3">
            <Avatar name={name} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold">{name}</span>
              <span className="truncate text-xs text-muted" dir="ltr">
                {user.email}
              </span>
              <span className="mt-1">
                <Pill tone="primary">
                  <ShieldCheck className="size-3" aria-hidden />
                  {t("profile.role")}
                </Pill>
              </span>
            </span>
          </div>
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
          >
            <UserCog className="size-4 text-muted" aria-hidden />
            {t("profile.account")}
          </Link>
          <Link
            role="menuitem"
            href="/"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted"
          >
            <ExternalLink className="size-4 text-muted" aria-hidden />
            {t("backToSite")}
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={signOut}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm text-danger-strong hover:bg-danger-subtle"
          >
            <LogOut className="size-4" aria-hidden />
            {t("signOut")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function AdminHeaderBar() {
  const t = useTranslations("adminPanel");
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-glass px-4 backdrop-blur-xl sm:px-6">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-subtle px-2.5 py-1 text-xs font-semibold text-primary max-sm:hidden">
        <ShieldCheck className="size-3.5" aria-hidden />
        {t("prefix")}
      </span>
      <div className="flex flex-1 justify-center">
        <AdminSearch />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <LanguageSwitcher />
        <ThemeToggle />
        <AdminProfileMenu />
      </div>
    </header>
  );
}
