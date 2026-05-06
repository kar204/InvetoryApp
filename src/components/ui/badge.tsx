import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg border px-3 py-1 text-xs font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-ring/40 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:border-primary/50",
        secondary: "border-border bg-muted text-muted-foreground hover:bg-accent hover:border-border",
        destructive: "border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15 hover:border-destructive/50",
        outline: "border-border/60 text-foreground hover:bg-muted/40 hover:border-border/80",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
