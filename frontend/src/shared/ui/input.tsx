import * as React from "react"

import { cn } from "@/shared/lib/utils"

/**
 * Fields sit *in* the surface rather than on top of it — a recessed well with a
 * hairline border, at the compact 8-unit control height the workspace uses
 * throughout. No drop shadow: elevation is reserved for things that float.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-input bg-background/60 px-2.5 py-1 text-sm transition-[color,box-shadow] outline-none selection:bg-primary/30 selection:text-foreground file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
