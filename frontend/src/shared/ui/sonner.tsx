import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import type { CSSProperties } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Toast host. The registry version reads the active theme from `next-themes`;
 * Narrative Mind is dark-only (docs/frontend/COMPONENT_HIERARCHY.md §2), so the
 * theme is pinned and that dependency is not carried.
 *
 * Toasts sit on the popover surface with squared corners to match the rest of
 * the workspace chrome rather than the rounded default.
 */
function Toaster(props: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      position="bottom-right"
      offset={36}
      icons={{
        success: <CircleCheckIcon className="size-4 text-success" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4 text-warning" />,
        error: <OctagonXIcon className="size-4 text-destructive" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-md)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
