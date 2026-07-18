import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"
import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Badges read as *tags on a record*, not as pills on a dashboard: squared
 * corners, a tinted wash rather than a solid fill, and the compact `2xs` type
 * from the scale. Semantic variants map straight onto the semantic tokens so a
 * status never picks its own color.
 */
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-sm border px-1.5 py-px text-2xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "border-primary/25 bg-primary/15 text-primary [a&]:hover:bg-primary/25",
        secondary:
          "border-border bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80",
        outline: "border-border text-muted-foreground [a&]:hover:text-foreground",
        success: "border-success/25 bg-success/15 text-success [a&]:hover:bg-success/25",
        warning: "border-warning/25 bg-warning/15 text-warning [a&]:hover:bg-warning/25",
        destructive:
          "border-destructive/30 bg-destructive/15 text-destructive [a&]:hover:bg-destructive/25",
        /** Colour supplied by the caller from an entity accent token. */
        accent: "border-current/25 bg-current/10",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
