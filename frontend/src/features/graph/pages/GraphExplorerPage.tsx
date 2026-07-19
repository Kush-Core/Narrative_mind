import { InfoIcon, WaypointsIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { GraphCanvas } from "@/features/graph/components/GraphCanvas"
import { GraphInspector } from "@/features/graph/components/GraphInspector"
import { GraphLegend } from "@/features/graph/components/GraphLegend"
import { GraphSourcePicker } from "@/features/graph/components/GraphSourcePicker"
import { GraphViewportControls } from "@/features/graph/components/GraphViewportControls"
import type { GraphRenderer } from "@/features/graph/engine"
import { NetworkDepthSchema } from "@/features/graph/model/graph.schema"
import { EMPTY_GRAPH_MODEL, type GraphElementRef } from "@/features/graph/model/graph.types"
import { useCharacterNetworkQuery } from "@/features/graph/queries/graph.queries"
import { useGraphInteraction } from "@/features/graph/state/useGraphInteraction"
import { toUserMessage } from "@/shared/api/error-presentation"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { Button } from "@/shared/ui/button"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { ErrorState } from "@/shared/ui/composite/ErrorState"
import { LoadingState } from "@/shared/ui/composite/LoadingState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"
import { Toolbar, ToolbarGroup, ToolbarSpacer } from "@/shared/ui/composite/Toolbar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

/**
 * The Graph workspace.
 *
 * Composition only — it wires the five separated concerns together and owns
 * none of them:
 *
 *   which graph to show  → URL search params (`?character=&depth=`)
 *   the data             → `useCharacterNetworkQuery` (TanStack Query)
 *   the drawing          → `GraphCanvas` → renderer
 *   selection            → `useGraphInteraction`
 *   the camera           → the renderer, mirrored read-only for display
 *
 * Keeping the source in the URL means a particular view of the world is
 * shareable and survives a reload, consistent with D6 — the same reasoning the
 * entity lists use, applied to a subsystem that shares none of their code.
 */

const DEPTH_OPTIONS = [1, 2, 3] as const

export function GraphExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [renderer, setRenderer] = useState<GraphRenderer | null>(null)

  const characterId = searchParams.get("character") ?? undefined
  const depth = NetworkDepthSchema.parse(searchParams.get("depth") ?? undefined)

  const query = useCharacterNetworkQuery(characterId, depth)
  const model = query.data ?? EMPTY_GRAPH_MODEL

  /** Opening an element leaves the graph for that entity's detail screen. */
  const handleActivate = useCallback(
    (ref: GraphElementRef) => {
      if (ref.element !== "node") return
      const node = model.nodes.find((candidate) => candidate.id === ref.id)
      const detailPath = node && entityKindIdentity(node.kind).detailPath?.(node.id)
      if (detailPath) void navigate(detailPath)
    },
    [model, navigate],
  )

  const { selection, viewport } = useGraphInteraction(renderer, model, {
    onActivate: handleActivate,
  })

  function updateParam(key: string, value: string | undefined) {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (value === undefined) next.delete(key)
        else next.set(key, value)
        return next
      },
      { replace: true },
    )
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Graph explorer"
        description="Trace how the people of your world connect."
        actions={<GraphLegend />}
      >
        <Toolbar>
          <ToolbarGroup>
            <GraphSourcePicker
              characterId={characterId}
              onSelect={(id) => updateParam("character", id)}
            />

            <Select value={String(depth)} onValueChange={(value) => updateParam("depth", value)}>
              {/* Wide enough for "Within 3 hops" — a narrower trigger clips the
                  plural and it reads as a typo. */}
              <SelectTrigger size="sm" className="w-40" aria-label="Network depth">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEPTH_OPTIONS.map((value) => (
                  <SelectItem key={value} value={String(value)}>
                    {value === 1 ? "Direct links" : `Within ${value} hops`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ToolbarGroup>

          <ToolbarSpacer />

          <GraphViewportControls
            renderer={renderer}
            viewport={viewport}
            disabled={model.nodes.length === 0}
          />
        </Toolbar>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {!characterId ? (
            <EmptyState
              icon={WaypointsIcon}
              title="Choose a character"
              description="The graph is explored from a character outward. Pick one to see who they are connected to."
            />
          ) : query.isPending ? (
            <LoadingState rows={6} label="Loading network" />
          ) : query.isError ? (
            <ErrorState
              title="Could not load this network"
              description={toUserMessage(query.error)}
              onRetry={() => void query.refetch()}
            />
          ) : model.nodes.length <= 1 ? (
            <EmptyState
              icon={WaypointsIcon}
              title="No connections yet"
              description="This character has no relationships recorded, so there is nothing to trace."
            />
          ) : (
            <>
              <GraphCanvas
                model={model}
                onRendererReady={setRenderer}
                label={`Network of ${model.nodes.length} nodes and ${model.edges.length} connections`}
              />

              {/* The honest notice. At depth > 1 the backend reports which nodes
                  are reachable but not how, so no edges are drawn — and the user
                  is told why rather than being left to infer that these nodes are
                  unconnected. */}
              {!model.edgesAreComplete ? (
                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3">
                  <p className="pointer-events-auto flex max-w-xl items-start gap-2 rounded-md border bg-card/95 px-3 py-2 text-2xs text-muted-foreground shadow-sm">
                    <InfoIcon className="mt-px size-3.5 shrink-0" aria-hidden />
                    <span>
                      Beyond direct links the API reports which characters are reachable, but not
                      the connections between them — so none are drawn.{" "}
                      <Button
                        variant="link"
                        size="sm"
                        className="h-auto p-0 text-2xs"
                        onClick={() => updateParam("depth", "1")}
                      >
                        Show direct links
                      </Button>
                    </span>
                  </p>
                </div>
              ) : null}
            </>
          )}
        </div>

        <aside className="w-72 shrink-0 overflow-auto border-l" aria-label="Graph inspector">
          <GraphInspector selection={selection} model={model} />
        </aside>
      </div>
    </div>
  )
}
