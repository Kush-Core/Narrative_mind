import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"

/**
 * Renders an event's position on the world timeline
 * (docs/frontend/COMPONENT_HIERARCHY.md §6).
 *
 * Deliberately presentational and value-neutral: the backend defines
 * `timeline_order` as a bare relative integer with a default of `0` and no
 * meaning attached to any particular value. So this shows the number and does
 * **not** invent semantics the domain does not have — no "unplaced" for zero
 * (zero is a legitimate first position), no date formatting (there are no
 * dates), no ordinal suffixes (the scale is relative, not a rank).
 *
 * Tabular figures keep the column visually aligned when a list is sorted by
 * position, which is the reading most timeline work depends on.
 */
export function TimelinePositionBadge({ order, className }: { order: number; className?: string }) {
  return (
    <Badge variant="secondary" className={cn("font-mono tabular-nums", className)}>
      <span className="sr-only">Timeline position </span>
      {order}
    </Badge>
  )
}
