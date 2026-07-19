import { FocusIcon, MaximizeIcon, ScanIcon, ZoomInIcon, ZoomOutIcon } from "lucide-react"

import type { GraphRenderer } from "@/features/graph/engine"
import type { GraphElementRef, GraphViewport } from "@/features/graph/model/graph.types"
import { Button } from "@/shared/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/shared/ui/tooltip"

/**
 * Viewport commands.
 *
 * Every control is a *command to the renderer*, not a state mutation — the
 * renderer owns the camera and reports back. That is why this takes a
 * `GraphRenderer` and a read-only `viewport` for display, rather than a pair of
 * zoom setters.
 */

const ZOOM_STEP = 1.3

interface GraphViewportControlsProps {
  renderer: GraphRenderer | null
  viewport: GraphViewport
  /** Drives "fit selection"; framing nothing would be a zoom to the origin. */
  selectedRefs: readonly GraphElementRef[]
  disabled?: boolean
}

export function GraphViewportControls({
  renderer,
  viewport,
  selectedRefs,
  disabled = false,
}: GraphViewportControlsProps) {
  const isDisabled = disabled || renderer === null
  const hasSelection = selectedRefs.length > 0

  return (
    <div className="flex items-center gap-1">
      <ControlButton
        label="Zoom out"
        icon={<ZoomOutIcon aria-hidden />}
        disabled={isDisabled}
        onClick={() => renderer?.zoomBy(1 / ZOOM_STEP)}
      />

      {/* Rounded for legibility; the renderer keeps the precise value. */}
      <span className="w-12 text-center font-mono text-2xs text-muted-foreground tabular-nums">
        {Math.round(viewport.zoom * 100)}%
      </span>

      <ControlButton
        label="Zoom in"
        icon={<ZoomInIcon aria-hidden />}
        disabled={isDisabled}
        onClick={() => renderer?.zoomBy(ZOOM_STEP)}
      />

      <ControlButton
        label="Fit to screen"
        icon={<MaximizeIcon aria-hidden />}
        disabled={isDisabled}
        onClick={() => renderer?.fit()}
      />

      {/* Framing a subset is only meaningful with one, so the control appears
          with the selection rather than sitting permanently disabled. */}
      {hasSelection ? (
        <ControlButton
          label="Fit selection"
          icon={<ScanIcon aria-hidden />}
          disabled={isDisabled}
          onClick={() => renderer?.fitTo(selectedRefs)}
        />
      ) : null}

      <ControlButton
        label="Reset viewport"
        icon={<FocusIcon aria-hidden />}
        disabled={isDisabled}
        onClick={() => renderer?.resetViewport()}
      />
    </div>
  )
}

function ControlButton({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  onClick: () => void
  disabled: boolean
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
