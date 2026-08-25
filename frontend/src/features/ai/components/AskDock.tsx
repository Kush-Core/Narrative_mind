import { useQuery } from "@tanstack/react-query"
import { XIcon } from "lucide-react"
import { useState } from "react"
import { useLocation } from "react-router-dom"

import { AskPanel } from "@/features/ai/components/AskPanel"
import { ENTITY_COLLECTIONS, type EntityCollection } from "@/shared/api/endpoints"
import { lookupEntity } from "@/shared/api/entity-lookup"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * Ask, docked beside whatever the user is already looking at.
 *
 * The same `AskPanel` the `/ask` route mounts — not a second, smaller
 * implementation of it. The route and the dock differ only in the frame around
 * the panel, which is the only way to guarantee they never disagree about how
 * asking behaves.
 *
 * What the dock adds is *context*: opened on an entity's detail screen, it
 * starts with that entity's name already in the question. The name is the real
 * friction — invented spellings are easy to get wrong and tedious to retype —
 * so seeding it saves the work without presuming what the question is. It is a
 * prefill, never a submission.
 *
 * **Seeded once, when the dock opens, and never again.** The dock mounts on
 * open, so mount-time seeding says exactly that. Re-seeding on navigation would
 * mean remounting the panel — and the most ordinary thing a user does with an
 * answer is click one of its citations, which navigates. Throwing the answer
 * away at that moment would make citations hostile.
 *
 * Loaded lazily by the workspace shell. That matters: the shell is eager, so an
 * ordinary import here would put the whole AI slice in the initial bundle for
 * every visitor, dock open or not.
 */

interface AskDockProps {
  onClose: () => void
}

/** `/characters/abc-123` → the collection and id it addresses, if it is one. */
function entityRouteOf(pathname: string): { collection: EntityCollection; id: string } | null {
  const segments = pathname.split("/").filter((segment) => segment !== "")
  const [first, second, ...rest] = segments
  if (first === undefined || second === undefined || rest.length > 0) return null

  const collection = (Object.keys(ENTITY_COLLECTIONS) as EntityCollection[]).find(
    (key) => ENTITY_COLLECTIONS[key] === `/${first}`,
  )
  return collection === undefined ? null : { collection, id: decodeURIComponent(second) }
}

export function AskDock({ onClose }: AskDockProps) {
  const { pathname } = useLocation()
  // Captured once, at mount: this is the entity the dock was opened *on*, and
  // it must not change under the panel afterwards.
  const [route] = useState(() => entityRouteOf(pathname))

  const collection = route?.collection
  const id = route?.id

  // The same key shape `EntityPicker` uses to resolve a preselected id, so the
  // two share a cache entry rather than asking for the same name twice.
  const entity = useQuery({
    queryKey: ["entity-lookup", "one", collection, id],
    queryFn: ({ signal }) =>
      collection !== undefined && id !== undefined ? lookupEntity(collection, id, signal) : null,
    enabled: collection !== undefined && id !== undefined,
    staleTime: 60_000,
  })

  // Hold the panel back until the seed is known, rather than mounting it empty
  // and remounting it once the name arrives.
  const resolving = route !== null && entity.isPending

  return (
    <aside className="flex h-full min-w-0 flex-col border-l bg-background">
      <header className="flex min-h-8 shrink-0 items-center gap-2 border-b bg-chrome px-3 py-2">
        <SectionLabel>Ask</SectionLabel>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto"
          onClick={onClose}
          aria-label="Close the ask panel"
        >
          <XIcon aria-hidden />
        </Button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {resolving ? null : <AskPanel initialQuestion={entity.data?.name ?? ""} />}
      </div>
    </aside>
  )
}
