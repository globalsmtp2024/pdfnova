import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { MeshBackground } from "@/components/ui/backgrounds";

export function StatusScreen({
  icon: Icon,
  code,
  title,
  body,
  actions,
}: {
  icon: LucideIcon;
  code?: string;
  title: string;
  body: string;
  actions?: ReactNode;
}) {
  return (
    <section className="relative isolate flex flex-1 items-center overflow-hidden py-20">
      <MeshBackground pattern="dots" />
      <div className="container-page flex max-w-xl flex-col items-center gap-5 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-cta-gradient text-white shadow-floating">
          <Icon className="size-8" aria-hidden />
        </span>
        {code ? <p className="font-mono text-sm font-semibold text-primary">{code}</p> : null}
        <h1 className="text-h1 font-bold tracking-tight">{title}</h1>
        <p className="text-muted">{body}</p>
        {actions ? <div className="flex flex-wrap justify-center gap-2">{actions}</div> : null}
      </div>
    </section>
  );
}
