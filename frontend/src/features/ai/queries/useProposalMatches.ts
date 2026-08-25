import { useQueries } from "@tanstack/react-query"

import type { ExtractedEntity } from "@/features/ai/model/ai.schema"
import type { EntityCollection } from "@/shared/api/endpoints"
import { ENTITY_LOOKUP_LIMIT, lookupEntities } from "@/shared/api/entity-lookup"
import { entityKindIdentity, type NodeKind } from "@/shared/domain/entity-kinds"

/**
 * Deciding whether a proposed entity already exists in the world.
 *
 * Without this the extract page is a list of names and nothing more. With it,
 * the useful question — *is this already here?* — is answered inline, which is
 * the whole point of a review surface that deliberately writes nothing.
 *
 * **Why this is a query when the four AI calls are not.** An extraction is not
 * server state; the contents of the world are. So this reads through the normal
 * cache, and reuses the *exact* key shape `EntityPicker` already uses
 * (`["entity-lookup", collection, search, limit]`) so the two share entries
 * rather than issuing the same search twice.
 *
 * The match is on the trimmed, case-folded name, because `name_contains` is a
 * substring filter: searching "Aria" also returns "Aria Vane's Keep", and only
 * an exact name is evidence that the proposal *is* that entity.
 */

export type ProposalMatch =
  | { status: "pending" }
  /** Already in the world — the chip links to it. */
  | { status: "existing"; id: string }
  /** Not found. A proposal, not a problem. */
  | { status: "new" }
  /** No collection to search, or the search failed. Absence is not proven. */
  | { status: "unresolvable" }

/** Stable identity for a proposal, since proposals have no ids. */
export function proposalKey(kind: NodeKind, name: string): string {
  return `${kind} ${name.trim().toLowerCase()}`
}

interface LookupTarget {
  key: string
  collection: EntityCollection
  name: string
}

export function useProposalMatches(
  entities: readonly ExtractedEntity[],
): Map<string, ProposalMatch> {
  // One request per distinct name, not per proposal: a passage naming the same
  // character three times must not search for it three times.
  const targets = new Map<string, LookupTarget>()
  const unresolvable = new Set<string>()

  for (const entity of entities) {
    const key = proposalKey(entity.kind, entity.name)
    const { collection } = entityKindIdentity(entity.kind)

    if (collection === undefined) {
      unresolvable.add(key)
      continue
    }
    if (!targets.has(key)) targets.set(key, { key, collection, name: entity.name.trim() })
  }

  const ordered = [...targets.values()]

  return useQueries({
    queries: ordered.map((target) => ({
      queryKey: ["entity-lookup", target.collection, target.name, ENTITY_LOOKUP_LIMIT],
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        lookupEntities(target.collection, { search: target.name, signal }),
      // Proposals are reviewed over a minute or two; refetching every name on
      // each window focus would be noise against an unchanging world.
      staleTime: 60_000,
    })),
    combine: (results) => {
      const matches = new Map<string, ProposalMatch>()

      for (const key of unresolvable) matches.set(key, { status: "unresolvable" })

      results.forEach((result, index) => {
        const target = ordered[index]
        if (target === undefined) return

        if (result.isPending) {
          matches.set(target.key, { status: "pending" })
          return
        }

        // A failed lookup is not evidence of absence, so it claims neither.
        if (result.isError || result.data === undefined) {
          matches.set(target.key, { status: "unresolvable" })
          return
        }

        const wanted = target.name.toLowerCase()
        const exact = result.data.find((option) => option.name.trim().toLowerCase() === wanted)

        matches.set(target.key, exact ? { status: "existing", id: exact.id } : { status: "new" })
      })

      return matches
    },
  })
}
