import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        // Piedra con filete de ocre: la insignia señala sin gastar el acento, que el
        // brandbook reserva para una sola acción por pantalla. 6,88:1.
        accent: "border-ocre/50 bg-piedra text-aviso-900",
        outline: "text-foreground",
        success: "border-transparent bg-ok-100 text-ok-900",
        warning: "border-transparent bg-aviso-100 text-aviso-900",
        destructive: "border-transparent bg-destructive text-destructive-foreground",
        muted: "border-transparent bg-muted text-muted-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
