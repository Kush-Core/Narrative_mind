import { PlusIcon, WaypointsIcon } from "lucide-react"
import { useMemo, useState } from "react"
import { Link } from "react-router-dom"

import { paths } from "@/routes/paths"
import type { EntityKind } from "@/shared/domain/entity-kinds"
import { endpointsForEntity, relationshipRoleFor } from "@/shared/domain/relationships"
import { RelationshipDialog } from "@/shared/relationships/RelationshipDialog"
import { Button } from "@/shared/ui/button"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * The relationship entry point on an entity's detail screen.
 *
 * Dropped into each descriptor's `detail` slot, so all four entity types get the
 * same affordance from one component and the generic `EntityDetailView` stays
 * free of any relationship-specific branch.
 *
 * ---------------------------------------------------------------------------
 * Why this section does not list existing relationships
 * ---------------------------------------------------------------------------
 *
 * There is no endpoint that returns an entity's relationships. The nearest thing
 * is `GET /graph/characters/{id}/network`, which is **Character-rooted** — so a
 * list could be built here for characters and for no one else. Three of the four
 * screens would show a section the fourth does not, and the inconsistency would
 * read as a bug rather than as the backend asymmetry it is.
 *
 * So this section owns creation, and the graph owns reading — which is where a
 * relationship is legible anyway, and where it appears immediately because the
 * write invalidates the graph cache. The link below is the handoff.
 *
 * Listing relationships per entity becomes worth building when the backend can
 * answer the question for any node, not just a character.
 */

interface RelationshipsSectionProps {
  kind: EntityKind
  id: string
  name: string
}

export function RelationshipsSection({ kind, id, name }: RelationshipsSectionProps) {
  const [isOpen, setOpen] = useState(false)
  // Which end this entity occupies is forced by the backend, not chosen here.
  const role = relationshipRoleFor(kind)
  const endpoints = useMemo(() => endpointsForEntity(kind, id, name), [kind, id, name])

  return (
    <section className="flex flex-col gap-3 border-t pt-6">
      <div className="flex items-center justify-between gap-3">
        <SectionLabel>Relationships</SectionLabel>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <PlusIcon aria-hidden />
          Add relationship
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {role === "source"
          ? "Connect this character to the people, places, factions, and events they belong to."
          : `Record which characters connect to this ${kind.toLowerCase()}.`}
      </p>

      {/* Where the result is visible. The graph is rooted at a character, so
          this links to the graph itself from a non-character entity rather than
          to a view that cannot be centred on it. */}
      <Button asChild variant="link" size="sm" className="h-auto self-start p-0 text-xs">
        <Link to={role === "source" ? paths.graph.forCharacter(id) : paths.graph.explorer()}>
          <WaypointsIcon aria-hidden />
          {role === "source" ? "View in graph" : "Open the graph explorer"}
        </Link>
      </Button>

      <RelationshipDialog open={isOpen} onOpenChange={setOpen} endpoints={endpoints} />
    </section>
  )
}
