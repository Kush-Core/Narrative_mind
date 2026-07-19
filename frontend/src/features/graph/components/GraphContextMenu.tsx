import {
  CrosshairIcon,
  ExternalLinkIcon,
  PencilIcon,
  WaypointsIcon,
  ZoomInIcon,
} from "lucide-react"

import type { GraphNode, GraphPoint } from "@/features/graph/model/graph.types"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/ui/dropdown-menu"

/**
 * Contextual actions for a graph node.
 *
 * **Why a `DropdownMenu` anchored to an invisible point rather than a
 * `ContextMenu`.** Radix's context menu wraps a DOM element that owns the
 * right-click. Graph nodes are painted pixels on a `<canvas>` — there is no
 * element to wrap. So the renderer reports *where* the right-click landed
 * (`elementContextMenu`), and a zero-size div is positioned there for the menu
 * to anchor to. That keeps the interaction inside the existing primitive instead
 * of adding a second menu component, and keeps Cytoscape's event out of the
 * application: what arrives here is a `GraphElementRef` and a point.
 *
 * **Every action is a delegation.** Opening and editing route to the entity
 * screens; connecting starts the shared relationship workflow; centring and
 * framing are renderer commands. Nothing here does work that exists elsewhere,
 * which is what stops the graph accumulating a parallel implementation of the
 * app.
 */

export interface GraphContextMenuTarget {
  node: GraphNode
  position: GraphPoint
}

interface GraphContextMenuProps {
  target: GraphContextMenuTarget | null
  onOpenChange: (open: boolean) => void
  onOpenDetails: (node: GraphNode) => void
  onEditEntity: (node: GraphNode) => void
  onCreateRelationship: (node: GraphNode) => void
  onExploreFrom: (node: GraphNode) => void
  onCenter: (node: GraphNode) => void
}

export function GraphContextMenu({
  target,
  onOpenChange,
  onOpenDetails,
  onEditEntity,
  onCreateRelationship,
  onExploreFrom,
  onCenter,
}: GraphContextMenuProps) {
  if (!target) return null

  const { node, position } = target
  const identity = entityKindIdentity(node.kind)
  // An unrecognised label has no collection behind it, so there is nothing to
  // open, edit, or connect — only camera actions remain meaningful.
  const isKnownEntity = identity.collection !== undefined
  // Ego networks are Character-rooted, so only a character can become the centre.
  const canExplore = node.kind === "Character" && !node.isFocus

  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      {/* The anchor: zero-size, fixed at the pointer, purely a position for the
          menu to attach to. */}
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none fixed size-0 p-0 opacity-0"
        style={{ left: position.x, top: position.y }}
      />

      <DropdownMenuContent align="start" className="w-52">
        <DropdownMenuLabel className="flex items-center gap-1.5">
          <identity.icon className={`size-3.5 shrink-0 ${identity.accentClassName}`} aria-hidden />
          <span className="truncate">{node.label}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {isKnownEntity ? (
          <>
            <DropdownMenuItem onSelect={() => onOpenDetails(node)}>
              <ExternalLinkIcon aria-hidden />
              Open details
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onEditEntity(node)}>
              <PencilIcon aria-hidden />
              Edit {identity.singular.toLowerCase()}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onCreateRelationship(node)}>
              <WaypointsIcon aria-hidden />
              Create relationship
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}

        {canExplore ? (
          <DropdownMenuItem onSelect={() => onExploreFrom(node)}>
            <ZoomInIcon aria-hidden />
            Explore from here
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuItem onSelect={() => onCenter(node)}>
          <CrosshairIcon aria-hidden />
          Centre on this node
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
