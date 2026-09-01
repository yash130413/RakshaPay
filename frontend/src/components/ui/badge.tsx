import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-secondary text-secondary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
        recovery: "border-transparent bg-recovery-muted text-recovery-foreground",
        escalate: "border-transparent bg-escalate-muted text-escalate-foreground",
        reject: "border-transparent bg-reject-muted text-reject-foreground",
        gemini: "border-transparent bg-gemini-muted text-gemini-foreground",
        rules: "border-transparent bg-rules-muted text-rules-foreground",
        live: "border-transparent bg-recovery-muted text-recovery",
        brand: "border-transparent bg-brand text-brand-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
