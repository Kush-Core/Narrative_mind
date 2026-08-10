import { ArrowRightIcon, RouteIcon } from "lucide-react"
import { useCallback } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"

import { useShortestPathQuery } from "@/features/graph/queries/graph.queries"
import { paths } from "@/routes/paths"
import { toUserMessage } from "@/shared/api/error-presentation"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { Button } from "@/shared/ui/button"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { EntityPicker } from "@/shared/ui/composite/EntityPicker"
import { ErrorState } from "@/shared/ui/composite/ErrorState"
import { LoadingState } from "@/shared/ui/composite/LoadingState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"
import { Toolbar, ToolbarGroup } from "@/shared/ui/composite/Toolbar"

/**
 * The shortest chain of relationships between two characters.
 *
 * A sibling of the graph workspace rather than a mode of it: the network view
 * explores outward from one character, this answers a single, specific
 * question about two. `GET /graph/shortest-path` returns the full node
 * sequence and a distance, and nothing here draws a canvas — a breadcrumb of
 * hops is a truer picture of "the chain that connects them" than a laid-out
 * subgraph would be.
 *
 * The two endpoints live in `?source=&target=`, matching the graph
 * workspace's own use of the URL as the source of truth for "what am I
 * looking at" (GraphExplorerPage).
 */

const characterDetailPath = entityKindIdentity("Character").detailPath

export function ShortestPathPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()

  const source = searchParams.get("source") ?? undefined
  const target = searchParams.get("target") ?? undefined

  const query = useShortestPathQuery(source, target)

  const updateParam = useCallback(
    (key: "source" | "target", value: string | undefined) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value === undefined) next.delete(key)
          else next.set(key, value)
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const swap = useCallback(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        if (source === undefined) next.delete("target")
        else next.set("target", source)
        if (target === undefined) next.delete("source")
        else next.set("source", target)
        return next
      },
      { replace: true },
    )
  }, [setSearchParams, source, target])

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      <PageHeader
        title="Shortest path"
        description="Find the shortest chain of relationships between two characters."
      >
        <Toolbar>
          <ToolbarGroup>
            <EntityPicker
              kind="Character"
              value={source}
              onChange={(id) => updateParam("source", id)}
              placeholder="From character…"
              excludeIds={target ? [target] : undefined}
              className="w-56"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={swap}
              disabled={!source && !target}
              aria-label="Swap source and target"
            >
              <ArrowRightIcon aria-hidden />
            </Button>
            <EntityPicker
              kind="Character"
              value={target}
              onChange={(id) => updateParam("target", id)}
              placeholder="To character…"
              excludeIds={source ? [source] : undefined}
              className="w-56"
            />
          </ToolbarGroup>
        </Toolbar>
      </PageHeader>

      <div className="min-h-0 flex-1 overflow-auto">
        {!source || !target ? (
          <EmptyState
            icon={RouteIcon}
            title="Choose two characters"
            description="Pick a source and a target to trace the shortest chain of relationships between them."
          />
        ) : query.isPending ? (
          <LoadingState rows={3} label="Finding shortest path" />
        ) : query.isError ? (
          <ErrorState
            title="Could not find a path"
            description={toUserMessage(query.error)}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <div className="flex flex-col gap-4 px-5 py-4">
            <p className="text-xs text-muted-foreground">
              {query.data.distance === 0
                ? "Same character."
                : `${query.data.distance} ${query.data.distance === 1 ? "hop" : "hops"} apart.`}
            </p>

            <ol className="flex flex-wrap items-center gap-2" aria-label="Path">
              {query.data.hops.map((hop, index) => (
                <li key={`${hop.id}-${index}`} className="flex items-center gap-2">
                  {index > 0 ? (
                    <ArrowRightIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                  ) : null}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void navigate(characterDetailPath?.(hop.id) ?? paths.root())}
                  >
                    {hop.name}
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}
