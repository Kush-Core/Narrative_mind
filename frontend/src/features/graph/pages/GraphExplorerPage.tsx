import { InfoIcon, WaypointsIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { GraphCanvas } from "@/features/graph/components/GraphCanvas"
import { GraphConnectBanner } from "@/features/graph/components/GraphConnectBanner"
import {
  GraphContextMenu,
  type GraphContextMenuTarget,
} from "@/features/graph/components/GraphContextMenu"
import { GraphInspector } from "@/features/graph/components/GraphInspector"
import { GraphLegend } from "@/features/graph/components/GraphLegend"
import { GraphSourcePicker } from "@/features/graph/components/GraphSourcePicker"
import { GraphViewportControls } from "@/features/graph/components/GraphViewportControls"
import type { GraphRenderer } from "@/features/graph/engine"
import { NetworkDepthSchema } from "@/features/graph/model/graph.schema"
import {
  EMPTY_GRAPH_MODEL,
  type GraphElementRef,
  type GraphNode,
} from "@/features/graph/model/graph.types"
import { useCharacterNetworkQuery } from "@/features/graph/queries/graph.queries"
import { useGraphEditing } from "@/features/graph/state/useGraphEditing"
import { useGraphInteraction } from "@/features/graph/state/useGraphInteraction"
import { toUserMessage } from "@/shared/api/error-presentation"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { withEditIntent } from "@/shared/entity-kit/route-params"
import { RelationshipDialog } from "@/shared/relationships"
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
 * Composition only — it wires the separated concerns together and owns none of
 * them:
 *
 *   which graph to show  → URL search params (`?character=&depth=`)
 *   the data             → `useCharacterNetworkQuery` (TanStack Query)
 *   the drawing          → `GraphCanvas` → renderer
 *   selection            → `useGraphInteraction`
 *   editing              → `useGraphEditing`
 *   the camera           → the renderer, mirrored read-only for display
 *   writing a relationship → `RelationshipDialog` (shared, unchanged)
 *
 * Keeping the source in the URL means a particular view of the world is
 * shareable and survives a reload, consistent with D6 — the same reasoning the
 * entity lists use, applied to a subsystem that shares none of their code.
 *
 * **Every editing action leaves through an existing door.** Opening and editing
 * an entity are routes into the CRUD screens; creating a relationship is the
 * shared dialog with both endpoints pre-filled. The graph contributes the
 * gesture and the feedback, not a second implementation of the application.
 */

const DEPTH_OPTIONS = [1, 2, 3] as const

export function GraphExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [renderer, setRenderer] = useState<GraphRenderer | null>(null)
  const [contextTarget, setContextTarget] = useState<GraphContextMenuTarget | null>(null)

  const characterId = searchParams.get("character") ?? undefined
  const depth = NetworkDepthSchema.parse(searchParams.get("depth") ?? undefined)

  const query = useCharacterNetworkQuery(characterId, depth)
  const model = query.data ?? EMPTY_GRAPH_MODEL

  const editing = useGraphEditing(model)

  const nodeById = useCallback(
    (id: string) => model.nodes.find((node) => node.id === id) ?? null,
    [model],
  )

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

  const detailPathFor = useCallback(
    (node: GraphNode) => entityKindIdentity(node.kind).detailPath?.(node.id),
    [],
  )

  /**
   * A click means different things in different modes.
   *
   * Idle: double-click opens the entity. Connecting: a single click on a node
   * completes the pair. Routing both through here keeps the mode's meaning in
   * one place rather than spread across handlers.
   */
  const handleActivate = useCallback(
    (ref: GraphElementRef) => {
      if (ref.element !== "node") return
      const node = nodeById(ref.id)
      const detailPath = node && detailPathFor(node)
      if (detailPath) void navigate(detailPath)
    },
    [nodeById, detailPathFor, navigate],
  )

  const handleContextMenu = useCallback(
    ({ ref, position }: { ref: GraphElementRef; position: { x: number; y: number } }) => {
      if (ref.element !== "node") return
      const node = nodeById(ref.id)
      if (node) setContextTarget({ node, position })
    },
    [nodeById],
  )

  // Clicking empty canvas leaves connect mode — the same gesture that clears a
  // selection should abandon a half-made connection.
  const handleBackgroundTap = useCallback(() => editing.cancel(), [editing])

  const interactionOptions = useMemo(
    () => ({
      onActivate: handleActivate,
      onContextMenu: handleContextMenu,
      onBackgroundTap: handleBackgroundTap,
    }),
    [handleActivate, handleContextMenu, handleBackgroundTap],
  )

  const { selection, selectedRefs, select, selectOne, hoveredRef, viewport } = useGraphInteraction(
    renderer,
    model,
    interactionOptions,
  )

  /* ------------------------------------------------------- editing feedback */

  // The renderer is told how to look; it is never told what the rules are.
  useEffect(() => {
    renderer?.setEditingVisual(editing.visual)
  }, [renderer, editing.visual])

  // Hover only matters while connecting, and only as a preview.
  const hoveredNodeId = hoveredRef?.element === "node" ? hoveredRef.id : null
  const { previewTarget, mode } = editing
  useEffect(() => {
    if (mode !== "connecting") return
    previewTarget(hoveredNodeId)
  }, [mode, hoveredNodeId, previewTarget])

  /**
   * While connecting, a plain click chooses the destination.
   *
   * Selection is what the renderer reports on click, so the mode reinterprets
   * it rather than the renderer growing a second click channel — which would
   * mean the engine knowing that connecting exists.
   */
  const primaryId = selectedRefs.at(-1)
  useEffect(() => {
    if (mode !== "connecting" || !primaryId || primaryId.element !== "node") return
    editing.chooseTarget(primaryId.id)
  }, [mode, primaryId, editing])

  // Escape leaves connect mode, the conventional way out of a modal gesture.
  useEffect(() => {
    if (editing.mode !== "connecting") return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") editing.cancel()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [editing])

  /* ---------------------------------------------------------------- actions */

  function startConnect(node: GraphNode) {
    setContextTarget(null)
    selectOne(null)
    editing.beginConnect(node.id)
  }

  function openDetails(node: GraphNode) {
    setContextTarget(null)
    const detailPath = detailPathFor(node)
    if (detailPath) void navigate(detailPath)
  }

  function editEntity(node: GraphNode) {
    setContextTarget(null)
    const detailPath = detailPathFor(node)
    // Routes to the entity's own screen with the edit intent in the URL rather
    // than embedding the edit dialog here — which would pull all four CRUD
    // slices into the graph's lazy chunk.
    if (detailPath) void navigate(withEditIntent(detailPath))
  }

  function exploreFrom(node: GraphNode) {
    setContextTarget(null)
    editing.cancel()
    updateParam("character", node.id)
  }

  function centerOn(node: GraphNode) {
    setContextTarget(null)
    renderer?.centerOn({ element: "node", id: node.id })
  }

  const selectedNode = selection?.element === "node" ? selection.node : null
  const previewNode = editing.visual?.previewTargetId
    ? nodeById(editing.visual.previewTargetId)
    : null

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PageHeader title="Graph explorer" description="Trace how the people of your world connect.">
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

            {/* The connect affordance for people who never right-click. Enabled
                only with a node selected, because a connection needs an origin. */}
            <Button
              variant="outline"
              size="sm"
              disabled={!selectedNode || editing.mode === "connecting"}
              onClick={() => selectedNode && startConnect(selectedNode)}
            >
              <WaypointsIcon aria-hidden />
              Connect
            </Button>
          </ToolbarGroup>

          <ToolbarSpacer />

          {/* The legend lives in the toolbar, not in the header's `actions`
              slot. Every other screen puts its primary action there, and a
              non-interactive key sitting where users look for "New …" was the
              one place that pattern broke. */}
          <GraphLegend className="mr-1" />

          <GraphViewportControls
            renderer={renderer}
            viewport={viewport}
            selectedRefs={selectedRefs}
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

              {editing.sourceNode ? (
                <GraphConnectBanner
                  sourceNode={editing.sourceNode}
                  previewNode={previewNode}
                  targetCount={editing.visual?.validTargetIds.length ?? 0}
                  rejection={editing.rejection}
                  onCancel={editing.cancel}
                />
              ) : null}

              {/* The honest notice, for a backend that reports reachable nodes
                  without the relationships between them. Yields to the connect
                  banner, which occupies the same edge and is the more urgent
                  thing to read. */}
              {!model.edgesAreComplete && editing.mode === "idle" ? (
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
          <GraphInspector
            selection={selection}
            model={model}
            selectedCount={selectedRefs.length}
            onConnect={startConnect}
          />
        </aside>
      </div>

      <GraphContextMenu
        target={contextTarget}
        onOpenChange={(open) => !open && setContextTarget(null)}
        onOpenDetails={openDetails}
        onEditEntity={editEntity}
        onCreateRelationship={startConnect}
        onExploreFrom={exploreFrom}
        onCenter={centerOn}
      />

      {/* The shared workflow, handed both endpoints. The graph decides *which*
          two things connect; everything after that — type, sentiment,
          validation, the write, the toast, cache invalidation — is the same
          code the entity screens use. */}
      <RelationshipDialog
        open={editing.pendingEndpoints !== null}
        onOpenChange={(open) => !open && editing.resolvePending()}
        endpoints={editing.pendingEndpoints ?? undefined}
        onCreated={() => select([])}
      />
    </div>
  )
}
