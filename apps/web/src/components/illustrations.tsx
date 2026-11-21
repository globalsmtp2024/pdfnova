import { useId, type SVGProps } from "react";

import { cn } from "@/lib/utils";

type IllustrationProps = SVGProps<SVGSVGElement> & { className?: string };

function Page({
  x,
  y,
  w = 70,
  h = 90,
  tint,
  lines = 4,
  id,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  tint: string;
  lines?: number;
  id: string;
}) {
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={9}
        fill="var(--surface)"
        stroke="var(--border-strong)"
      />
      <rect x={x + 10} y={y + 12} width={w * 0.45} height={7} rx={3.5} fill={tint} opacity={0.85} />
      {Array.from({ length: lines }, (_, index) => (
        <rect
          key={`${id}-${index}`}
          x={x + 10}
          y={y + 28 + index * 11}
          width={w - 20 - (index % 2) * 14}
          height={5}
          rx={2.5}
          fill="var(--border-strong)"
        />
      ))}
    </g>
  );
}

export function DocumentStackIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 240 180"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5B4BFF" />
          <stop offset="1" stopColor="#12B5A6" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="160" rx="90" ry="10" fill="var(--primary)" opacity="0.08" />
      <g transform="rotate(-8 80 90)">
        <Page x={40} y={40} tint="#12B5A6" id={`${id}-a`} />
      </g>
      <g transform="rotate(6 160 90)">
        <Page x={130} y={36} tint="#EC4899" id={`${id}-b`} />
      </g>
      <Page x={82} y={26} w={78} h={104} tint={`url(#${id}-g)`} lines={5} id={`${id}-c`} />
      <circle cx="158" cy="122" r="16" fill={`url(#${id}-g)`} />
      <path
        d="m151 122 5 5 9-10"
        fill="none"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MergeIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <Page x={14} y={14} w={50} h={64} tint="#5B4BFF" lines={3} id={`${id}-a`} />
      <Page x={14} y={66} w={50} h={64} tint="#12B5A6" lines={3} id={`${id}-b`} />
      <path
        d="M72 46c30 0 34 24 60 24M72 98c30 0 34-28 60-28"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="2.5"
        className="animate-beam"
        strokeLinecap="round"
      />
      <Page x={140} y={20} w={78} h={100} tint="#8B5CF6" lines={5} id={`${id}-c`} />
    </svg>
  );
}

export function SplitIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <Page x={14} y={20} w={78} h={100} tint="#5B4BFF" lines={5} id={`${id}-a`} />
      <path
        d="M100 70c26 0 30-26 56-26M100 70c26 0 30 26 56 26"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2.5"
        className="animate-beam"
        strokeLinecap="round"
      />
      <Page x={164} y={10} w={56} h={60} tint="#12B5A6" lines={2} id={`${id}-b`} />
      <Page x={164} y={74} w={56} h={60} tint="#F97316" lines={2} id={`${id}-c`} />
    </svg>
  );
}

export function CompressIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 240 140"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <Page x={14} y={14} w={86} h={112} tint="#12B5A6" lines={6} id={`${id}-a`} />
      <path
        d="M112 70h36m-10-10 10 10-10 10"
        fill="none"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Page x={160} y={38} w={62} h={66} tint="#12B5A6" lines={3} id={`${id}-b`} />
    </svg>
  );
}

export function ShieldIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#10B981" />
          <stop offset="1" stopColor="#5B4BFF" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="86" fill="var(--success)" opacity="0.07" />
      <circle cx="100" cy="100" r="62" fill="var(--success)" opacity="0.08" />
      <path d="M100 34 152 54v42c0 34-22 58-52 70-30-12-52-36-52-70V54Z" fill={`url(#${id}-s)`} />
      <rect x="80" y="92" width="40" height="32" rx="6" fill="#fff" />
      <path d="M88 92v-8a12 12 0 0 1 24 0v8" fill="none" stroke="#fff" strokeWidth="6" />
      <circle cx="100" cy="106" r="4" fill="#10B981" />
      <rect x="98" y="108" width="4" height="8" rx="2" fill="#10B981" />
    </svg>
  );
}

export function SparkleIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 200 200"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#EC4899" />
        </linearGradient>
      </defs>
      <Page x={50} y={40} w={100} h={124} tint="#8B5CF6" lines={7} id={`${id}-p`} />
      <path
        d="m150 36 6 16 16 6-16 6-6 16-6-16-16-6 16-6Z"
        fill={`url(#${id}-a)`}
        className="animate-float"
      />
      <path d="m48 120 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" fill="#12B5A6" />
    </svg>
  );
}

export function WorkflowIllustration({
  className,
  labels,
  ...props
}: IllustrationProps & { labels: string[] }) {
  const id = useId();
  const nodes = labels.slice(0, 4);
  const colors = ["#5B4BFF", "#12B5A6", "#F97316", "#10B981"];
  const spacing = 220 / Math.max(nodes.length - 1, 1);
  return (
    <svg
      viewBox="0 0 300 120"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      {nodes.slice(0, -1).map((_, index) => (
        <path
          key={`${id}-edge-${index}`}
          d={`M${40 + index * spacing + 22} 60 C ${40 + index * spacing + spacing / 2} 30, ${40 + index * spacing + spacing / 2} 90, ${40 + (index + 1) * spacing - 22} 60`}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
          strokeLinecap="round"
          className="animate-beam"
          opacity="0.7"
        />
      ))}
      {nodes.map((label, index) => (
        <g key={`${id}-node-${index}`}>
          <circle
            cx={40 + index * spacing}
            cy={60}
            r={22}
            fill="var(--surface)"
            stroke={colors[index % colors.length]}
            strokeWidth="2.5"
          />
          <circle cx={40 + index * spacing} cy={60} r={9} fill={colors[index % colors.length]} />
          <text
            x={40 + index * spacing}
            y={104}
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted)"
            fontFamily="var(--font-sans)"
          >
            {label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function AuthIllustration({ className, ...props }: IllustrationProps) {
  const id = useId();
  return (
    <svg
      viewBox="0 0 320 260"
      role="img"
      aria-hidden
      className={cn("h-auto w-full", className)}
      {...props}
    >
      <defs>
        <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.04" />
        </linearGradient>
      </defs>
      <rect
        x="30"
        y="30"
        width="180"
        height="200"
        rx="18"
        fill={`url(#${id}-bg)`}
        stroke="#ffffff"
        strokeOpacity="0.35"
      />
      {Array.from({ length: 6 }, (_, index) => (
        <rect
          key={index}
          x="52"
          y={70 + index * 22}
          width={index % 2 ? 110 : 136}
          height="8"
          rx="4"
          fill="#ffffff"
          fillOpacity="0.55"
        />
      ))}
      <rect x="52" y="46" width="70" height="12" rx="6" fill="#ffffff" />
      <rect x="150" y="120" width="140" height="110" rx="18" fill="#ffffff" fillOpacity="0.95" />
      <path d="M220 146 248 157v20c0 18-12 30-28 37-16-7-28-19-28-37v-20Z" fill="#5B4BFF" />
      <path
        d="m209 178 8 8 15-16"
        fill="none"
        stroke="#fff"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="m262 52 7 17 17 7-17 7-7 17-7-17-17-7 17-7Z"
        fill="#ffffff"
        className="animate-float"
      />
    </svg>
  );
}
