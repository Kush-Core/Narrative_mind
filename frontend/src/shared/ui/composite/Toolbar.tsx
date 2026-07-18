import type { ComponentProps } from "react"

import { cn } from "@/shared/lib/utils"
import { Separator } from "@/shared/ui/separator"

/**
 * A horizontal strip of controls — filters, view switches, bulk actions — with
 * the workspace's compact rhythm. Grouped children are separated by hairlines
 * rather than whitespace, which is what makes a toolbar read as a tool instead
 * of a row of buttons.
 *
 * Composition, not configuration: callers place `ToolbarGroup`s and a
 * `ToolbarSpacer` themselves rather than passing a props schema.
 */
export function Toolbar({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      role="toolbar"
      data-slot="toolbar"
      className={cn("flex h-8 items-center gap-1.5 text-sm", className)}
      {...props}
    />
  )
}

export function ToolbarGroup({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="toolbar-group"
      className={cn("flex items-center gap-1", className)}
      {...props}
    />
  )
}

export function ToolbarSeparator({ className }: { className?: string }) {
  return <Separator orientation="vertical" className={cn("mx-1 h-4!", className)} />
}

/** Pushes everything after it to the trailing edge. */
export function ToolbarSpacer() {
  return <div className="flex-1" aria-hidden />
}
