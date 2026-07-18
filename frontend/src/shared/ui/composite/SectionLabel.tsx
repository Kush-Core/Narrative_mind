import type { ComponentProps } from "react"

import { cn } from "@/shared/lib/utils"

/**
 * The workspace's one label treatment for group headings — sidebar sections,
 * panel headers, palette groups, table heads. Defined once so "small uppercase
 * chrome label" is a single decision rather than a repeated class string.
 */
export function SectionLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="section-label"
      className={cn(
        "text-2xs font-medium tracking-wider text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  )
}
