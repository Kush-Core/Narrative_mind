import { cn } from "@/shared/lib/utils"
import { Skeleton } from "@/shared/ui/skeleton"

interface LoadingStateProps {
  /** Number of placeholder rows to reserve. */
  rows?: number
  /** Accessible description of what is loading. */
  label?: string
  className?: string
}

/**
 * A loading surface that reserves the shape of the content to come, so arriving
 * data settles in place instead of shoving the layout around. Deliberately not
 * a spinner: skeletons communicate *what* is loading, not merely that something
 * is.
 */
export function LoadingState({ rows = 5, label = "Loading", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex w-full flex-col gap-2 p-4", className)}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton
          key={index}
          className="h-7 w-full"
          // Rows taper slightly so the block reads as content, not a bar chart.
          style={{ opacity: 1 - index * (0.6 / Math.max(rows, 1)) }}
        />
      ))}
    </div>
  )
}
