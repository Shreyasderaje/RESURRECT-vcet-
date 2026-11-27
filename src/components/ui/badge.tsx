import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-tight transition-colors",
  {
    variants: {
      variant: {
        default: "border-slate-700/80 bg-slate-800/70 text-slate-200",
        sky: "border-sky-500/30 bg-sky-500/10 text-sky-300",
        indigo: "border-indigo-500/30 bg-indigo-500/10 text-indigo-300",
        emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
        amber: "border-amber-500/35 bg-amber-500/10 text-amber-300",
        rose: "border-rose-500/35 bg-rose-500/10 text-rose-300",
        purple: "border-purple-500/35 bg-purple-500/10 text-purple-300",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
