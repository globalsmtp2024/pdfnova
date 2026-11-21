import type { MDXComponents } from "mdx/types";
import type { ComponentProps } from "react";

import { Callout } from "@/components/ui/blocks";
import { brand } from "@/config/brand";
import { Link } from "@/i18n/navigation";

function Anchor({ href = "", children, ...props }: ComponentProps<"a">) {
  if (href.startsWith("/")) {
    return (
      <Link href={href} className="font-medium text-primary underline underline-offset-4">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={href}
      className="font-medium text-primary underline underline-offset-4"
      rel="noopener noreferrer"
      target="_blank"
      {...props}
    >
      {children}
    </a>
  );
}

function Brand() {
  return <>{brand.name}</>;
}

export const mdxComponents: MDXComponents = {
  h2: (props) => <h2 className="mt-12 scroll-mt-24 text-h2 font-bold tracking-tight" {...props} />,
  h3: (props) => <h3 className="mt-8 text-h3 font-semibold" {...props} />,
  p: (props) => <p className="mt-5 leading-[1.8] text-foreground/90" {...props} />,
  ul: (props) => (
    <ul className="mt-5 flex list-disc flex-col gap-2 ps-6 leading-[1.7]" {...props} />
  ),
  ol: (props) => (
    <ol className="mt-5 flex list-decimal flex-col gap-2 ps-6 leading-[1.7]" {...props} />
  ),
  li: (props) => <li className="ps-1" {...props} />,
  a: Anchor,
  strong: (props) => <strong className="font-semibold text-foreground" {...props} />,
  code: (props) => (
    <code
      className="rounded-md bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em]"
      dir="ltr"
      {...props}
    />
  ),
  table: (props) => (
    <div className="mt-6 overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-sm" {...props} />
    </div>
  ),
  thead: (props) => <thead className="bg-surface-muted" {...props} />,
  th: (props) => <th className="px-4 py-2.5 text-start font-semibold" {...props} />,
  td: (props) => <td className="border-t border-border px-4 py-2.5" {...props} />,
  blockquote: (props) => (
    <blockquote className="mt-6 border-s-4 border-primary/40 ps-4 text-muted italic" {...props} />
  ),
  Brand,
  Callout: (props: ComponentProps<typeof Callout>) => <Callout className="mt-8" {...props} />,
};
