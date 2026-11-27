import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#070a11] disabled:pointer-events-none disabled:opacity-45 cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-sky-500 to-indigo-500 text-slate-950 font-semibold shadow-sm shadow-sky-500/20 hover:from-sky-400 hover:to-indigo-400 active:scale-[0.99]",
        secondary:
          "bg-slate-800/80 text-slate-100 border border-slate-700/70 hover:bg-slate-800 hover:border-sky-400/40",
        outline:
          "border border-slate-700/70 bg-transparent text-slate-200 hover:bg-slate-800/60 hover:border-slate-500",
        ghost: "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100",
        danger:
          "bg-rose-500/15 text-rose-300 border border-rose-500/35 hover:bg-rose-500/25",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-lg px-5 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
);
Button.displayName = "Button";
