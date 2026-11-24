import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-(--radius-control) font-medium whitespace-nowrap transition-[background-color,color,box-shadow,transform,opacity] duration-200 ease-(--ease-spring) select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-cta-gradient text-primary-foreground shadow-soft hover:shadow-lifted hover:brightness-110",
        solid: "bg-primary text-primary-foreground shadow-soft hover:bg-primary-hover",
        secondary: "bg-primary-subtle text-primary hover:bg-primary-subtle/70",
        outline:
          "border border-border-strong bg-surface text-foreground hover:border-primary/50 hover:bg-surface-muted",
        ghost: "text-foreground hover:bg-surface-muted",
        danger: "bg-danger text-white shadow-soft hover:brightness-110",
        link: "h-auto px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-13 px-7 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "solid", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
    icon?: ReactNode;
    iconEnd?: ReactNode;
    mirrorIcon?: boolean;
    ref?: Ref<HTMLButtonElement>;
  };

export function Button({
  className,
  variant,
  size,
  asChild = false,
  loading = false,
  icon,
  iconEnd,
  mirrorIcon = false,
  disabled,
  children,
  type,
  ...props
}: ButtonProps) {
  if (asChild) {
    return (
      <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>
        {children}
      </Slot>
    );
  }
  const mirror = mirrorIcon ? "flip-rtl" : undefined;
  return (
    <button
      type={type ?? "button"}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn("animate-spin", icon || children ? "absolute" : null)} aria-hidden />
      ) : null}
      <span className={cn("inline-flex items-center justify-center gap-2", loading && "invisible")}>
        {icon ? <span className={cn("inline-flex", mirror)}>{icon}</span> : null}
        {children}
        {iconEnd ? <span className={cn("inline-flex", mirror)}>{iconEnd}</span> : null}
      </span>
    </button>
  );
}
