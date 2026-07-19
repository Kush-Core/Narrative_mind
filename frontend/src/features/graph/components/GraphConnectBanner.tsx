import { ArrowRightIcon, XIcon } from "lucide-react"

import type { GraphNode } from "@/features/graph/model/graph.types"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Kbd } from "@/shared/ui/composite/Kbd"

/**
 * The state banner for an in-progress connection.
 *
 * A mode the user is *in* has to be visible, or a graph where the next click
 * means something different is just a graph that behaves oddly. This says which
 * node the connection starts from, what to do next, and how to get out — the
 * three things a modal interaction owes its user.
 *
 * The node-level feedback (origin ringed, legal destinations lit, everything
 * else dimmed, dashed preview) is the renderer's; this carries the words. The
 * split matters: the renderer paints and this explains, so neither has to know
 * the other's business.
 */

interface GraphConnectBannerProps {
  sourceNode: GraphNode
  /** The legal destination currently under the pointer, if any. */
  previewNode: GraphNode | null
  targetCount: number
  rejection: string | null
  onCancel: () => void
}

export function GraphConnectBanner({
  sourceNode,
  previewNode,
  targetCount,
  rejection,
  onCancel,
}: GraphConnectBannerProps) {
  const sourceIdentity = entityKindIdentity(sourceNode.kind)
  const previewIdentity = previewNode ? entityKindIdentity(previewNode.kind) : null

  return (
    // Bottom rather than top: the graph is framed with only 48px of padding, so
    // a banner at the top sits over the highest node and makes it unclickable —
    // exactly the node someone may be trying to connect to. The bottom edge is
    // also where this workspace already puts transient notices.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-3">
      <div
        role="status"
        // Named because the shell's connection indicator is also a status
        // region; without this a screen reader announces two unlabelled ones.
        aria-label="Connecting relationship"
        className="pointer-events-auto flex max-w-2xl flex-col gap-1.5 rounded-md border border-ring/40 bg-card/95 px-3 py-2 shadow-lg"
      >
        <div className="flex items-center gap-2 text-sm">
          <span className="flex min-w-0 items-center gap-1.5">
            <sourceIdentity.icon
              className={cn("size-3.5 shrink-0", sourceIdentity.accentClassName)}
              aria-hidden
            />
            <span className="truncate font-medium">{sourceNode.label}</span>
          </span>

          <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />

          {/* The forming half of the sentence. A placeholder rather than an
              empty space, so the line does not jump as the pointer moves. */}
          {previewNode && previewIdentity ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <previewIdentity.icon
                className={cn("size-3.5 shrink-0", previewIdentity.accentClassName)}
                aria-hidden
              />
              <span className="truncate font-medium">{previewNode.label}</span>
            </span>
          ) : (
            <span className="text-muted-foreground italic">choose a destination</span>
          )}

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Cancel connection"
            onClick={onCancel}
            className="ml-1 shrink-0"
          >
            <XIcon aria-hidden />
          </Button>
        </div>

        <p className="text-2xs text-muted-foreground">
          {rejection ? (
            <span className="text-destructive">{rejection}</span>
          ) : targetCount === 0 ? (
            "Nothing in this view can be connected to it — every relationship needs a character at one end."
          ) : (
            <>
              Click a highlighted node to connect, or press <Kbd keys={["Esc"]} /> to cancel.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
