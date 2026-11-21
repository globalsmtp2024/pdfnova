"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  useEffect(() => {
    if (!inView || reduceMotion) return;
    const controls = animate(0, value, {
      duration: 1.2,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (latest) => setDisplay(Math.round(latest)),
    });
    return () => controls.stop();
  }, [inView, reduceMotion, value]);
  return (
    <span ref={ref} className="tabular-nums">
      {(reduceMotion ? value : display).toLocaleString()}
      {suffix}
    </span>
  );
}

export function Stat({
  value,
  suffix,
  label,
  className,
}: {
  value: number;
  suffix?: string;
  label: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <dd className="order-1 font-display text-4xl font-extrabold tracking-tight">
        <AnimatedNumber value={value} suffix={suffix} />
      </dd>
      <dt className="order-2 text-sm text-muted">{label}</dt>
    </div>
  );
}
