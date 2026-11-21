import { cn } from "@/lib/utils";

export function MeshBackground({
  className,
  pattern = "grid",
}: {
  className?: string;
  pattern?: "grid" | "dots" | "none";
}) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}
    >
      <div className="absolute inset-0 bg-mesh" />
      {pattern === "grid" ? <div className="absolute inset-0 bg-grid mask-radial" /> : null}
      {pattern === "dots" ? <div className="absolute inset-0 bg-dots mask-radial" /> : null}
      <div className="absolute -top-32 left-[8%] size-80 rounded-full bg-primary/25 blur-3xl dark:bg-primary/20" />
      <div className="absolute top-10 right-[6%] size-72 rounded-full bg-accent/20 blur-3xl dark:bg-accent/15" />
      <div className="absolute top-[22rem] left-1/2 h-40 w-[42rem] -translate-x-1/2 rounded-full bg-cat-ai/15 blur-3xl" />
      <div className="absolute inset-0 bg-noise opacity-[0.025] mix-blend-overlay dark:opacity-[0.03]" />
    </div>
  );
}

export function DotPattern({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute inset-0 -z-10 bg-dots mask-radial", className)}
    />
  );
}

export function GlowOrb({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none absolute -z-10 rounded-full blur-3xl", className)}
    />
  );
}

export function CurveDivider({ className, flip = false }: { className?: string; flip?: boolean }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      className={cn("block h-10 w-full text-surface sm:h-16", flip && "rotate-180", className)}
    >
      <path d="M0 64V32C240 4 480 0 720 16s480 40 720 16V64Z" fill="currentColor" />
    </svg>
  );
}
