import { ArrowUpRightIcon, WaypointsIcon } from "lucide-react"
import { Link } from "react-router-dom"

import type { GraphModel, GraphNode, GraphSelection } from "@/features/graph/model/graph.types"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * Details for the current selection.
 *
 * This is where the graph rejoins the rest of the application: a selected node
 * is an entity, and the inspector links through to the CRUD detail screen for
 * it. That link is the whole integration point between the two subsystems —
 * a route, not a shared abstraction.
 *
 * It reads from the model and the selection, never from the renderer, which is
 * what makes selection state independent of the rendering implementation.
 */

interface GraphInspectorProps {
  selection: GraphSelection | null
  model: GraphModel
  /** How many elements are selected in total; the inspector describes the last. */
  selectedCount: number
  /** Starts the shared relationship workflow from this node. */
  onConnect: (node: GraphNode) => void
}

export function GraphInspector({
  selection,
  model,
  selectedCount,
  onConnect,
}: GraphInspectorProps) {
  if (!selection) {
    return (
      <div className="flex flex-col gap-3 p-5">
        <SectionLabel>Selection</SectionLabel>
        <p className="text-xs text-muted-foreground">
          Select a node or an edge to inspect it. Double-click to open, right-click for actions.
        </p>
      </div>
    )
  }

  if (selection.element === "edge") {
    const { edge } = selection
    const source = model.nodes.find((node) => node.id === edge.source)
    const target = model.nodes.find((node) => node.id === edge.target)

    return (
      <div className="flex flex-col gap-3 p-5">
        <SectionLabel>Relationship</SectionLabel>
        <dl className="flex flex-col gap-3 text-sm">
          <Fact label="From" value={source?.label ?? edge.source} />
          <Fact label="To" value={target?.label ?? edge.target} />
          <Fact
            label="Type"
            value={
              edge.relType ? (
                <Badge variant="secondary" className="font-mono text-2xs">
                  {edge.relType}
                </Badge>
              ) : (
                // Honest about a backend limitation rather than showing a dash
                // that reads as "no relationship type exists".
                <span className="text-muted-foreground">Not reported by the graph API</span>
              )
            }
          />
          {/* Sentiment is only carried by KNOWS edges, so an absent one is not
              a gap worth a row. */}
          {edge.sentiment ? <Fact label="Sentiment" value={edge.sentiment} /> : null}
        </dl>
      </div>
    )
  }

  const { node } = selection
  const identity = entityKindIdentity(node.kind)
  const detailPath = identity.detailPath?.(node.id)

  return (
    <div className="flex flex-col gap-3 p-5">
      <SectionLabel>Selection</SectionLabel>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2">
          <identity.icon
            className={cn("mt-0.5 size-4 shrink-0", identity.accentClassName)}
            aria-hidden
          />
          <span className="text-sm font-medium wrap-break-word">{node.label}</span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary">{identity.singular}</Badge>
          {node.isFocus ? <Badge variant="outline">Centre</Badge> : null}
        </div>
      </div>

      {node.isUnlinked ? (
        <p className="text-2xs text-muted-foreground">
          Reachable from the centre, but the graph API does not report which connections lead here.
        </p>
      ) : null}

      <dl className="flex flex-col gap-3 text-sm">
        <Fact label="Identifier" value={<code className="font-mono text-xs">{node.id}</code>} />
      </dl>

      <div className="flex flex-col gap-2">
        {detailPath ? (
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link to={detailPath}>
              Open {identity.singular.toLowerCase()}
              <ArrowUpRightIcon aria-hidden />
            </Link>
          </Button>
        ) : null}

        {/* The same action the context menu and the toolbar offer — one
            handler, three ways to reach it. */}
        {identity.collection ? (
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => onConnect(node)}
          >
            <WaypointsIcon aria-hidden />
            Connect to…
          </Button>
        ) : null}
      </div>

      {/* Multi-selection is for framing, so it is reported rather than
          enumerated: the panel keeps describing one element, and the count says
          why the canvas shows more. */}
      {selectedCount > 1 ? (
        <p className="text-2xs text-muted-foreground">
          {selectedCount} elements selected. Use <span className="font-medium">Fit selection</span>{" "}
          to frame them.
        </p>
      ) : null}
    </div>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm wrap-break-word">{value}</dd>
    </div>
  )
}
