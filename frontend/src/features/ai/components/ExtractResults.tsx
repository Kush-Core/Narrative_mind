import { InboxIcon } from "lucide-react"
import { Link } from "react-router-dom"

import { EntityChip } from "@/features/ai/components/EntityChip"
import type { ExtractResult } from "@/features/ai/model/ai.schema"
import {
  proposalKey,
  type ProposalMatch,
  useProposalMatches,
} from "@/features/ai/queries/useProposalMatches"
import { paths } from "@/routes/paths"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * What a passage proposes — and nothing more.
 *
 * `/ai/extract` writes nothing to the graph, and neither does this screen. That
 * is a deliberate boundary rather than an unfinished one: the endpoint returns
 * entity *names*, not ids, so "apply this" would mean inventing a resolution
 * and multi-write flow on the client for something the backend does not model.
 * A review surface that quietly created records would also be the one AI
 * feature here with side effects, which is exactly the asymmetry this
 * integration avoids.
 *
 * So each proposal says only what is true about it: already in your world (and
 * here is the link), or not yet.
 */

interface ExtractResultsProps {
  result: ExtractResult
}

/** The trailing note on a proposal row. Absence is never claimed loosely. */
function MatchNote({ match }: { match: ProposalMatch | undefined }) {
  if (match === undefined || match.status === "pending") {
    return <span className="text-2xs text-muted-foreground">checking…</span>
  }
  if (match.status === "existing") {
    return <span className="text-2xs text-muted-foreground">already in your world</span>
  }
  if (match.status === "new") {
    return <span className="text-2xs text-muted-foreground">not in your world yet</span>
  }
  return null
}

export function ExtractResults({ result }: ExtractResultsProps) {
  const matches = useProposalMatches(result.entities)

  if (result.entities.length === 0 && result.relationships.length === 0) {
    return (
      <EmptyState
        icon={InboxIcon}
        title="Nothing recognisable in that passage"
        description="The extractor looks for people, places, factions, and events, and only reports a connection when the text gives it evidence. Naming them more directly usually helps."
      />
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-2xs text-muted-foreground">
        {result.entities.length} entities · {result.relationships.length} relationships
      </p>

      {result.entities.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Entities</SectionLabel>
          <ul className="flex flex-col gap-1.5">
            {result.entities.map((entity, index) => {
              const match = matches.get(proposalKey(entity.kind, entity.name))

              return (
                <li
                  key={`${entity.kind}-${entity.name}-${index}`}
                  className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"
                >
                  <EntityChip
                    kind={entity.kind}
                    name={entity.name}
                    // Only an existing entity has somewhere to go. A proposal
                    // renders with identical weight and simply does not link.
                    id={match?.status === "existing" ? match.id : undefined}
                  />
                  <MatchNote match={match} />
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

      {result.relationships.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Relationships</SectionLabel>
          {/* Endpoints here are **names**, not ids — this endpoint never touches
              the graph — so they are rendered as plain text rather than as
              chips that would imply something to navigate to. */}
          <div className="overflow-x-auto">
            <ul className="flex min-w-0 flex-col gap-1 font-mono text-2xs text-muted-foreground">
              {result.relationships.map((edge, index) => (
                <li key={`${edge.sourceName}-${edge.relType}-${edge.targetName}-${index}`}>
                  <span className="whitespace-nowrap">
                    {edge.sourceName}
                    <span className="mx-1.5 text-foreground/60">—{edge.relType}→</span>
                    {edge.targetName}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <p className="border-t pt-3 text-xs text-muted-foreground">
        These are proposals only — nothing has been added to your world. Create what you want to
        keep from{" "}
        <Link
          to={paths.characters.list()}
          className="text-primary underline-offset-4 hover:underline"
        >
          {entityKindIdentity("Character").plural}
        </Link>
        ,{" "}
        <Link
          to={paths.locations.list()}
          className="text-primary underline-offset-4 hover:underline"
        >
          {entityKindIdentity("Location").plural}
        </Link>
        ,{" "}
        <Link
          to={paths.factions.list()}
          className="text-primary underline-offset-4 hover:underline"
        >
          {entityKindIdentity("Faction").plural}
        </Link>
        , or{" "}
        <Link to={paths.events.list()} className="text-primary underline-offset-4 hover:underline">
          {entityKindIdentity("Event").plural}
        </Link>
        .
      </p>
    </div>
  )
}
