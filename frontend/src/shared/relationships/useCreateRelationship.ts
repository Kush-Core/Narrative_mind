/**
 * The relationship write, with its cache-coherence policy applied once.
 *
 * Mirrors `useEntityMutations` in intent — one hook owns the mutation, the
 * invalidation, and the success toast, so no screen re-derives them — but shares
 * no code with it, because a relationship is not an entity: there is no list to
 * invalidate, no detail key to seed, and no update or delete to pair with.
 *
 * **Not optimistic.** The write's visible effect is on the graph, which is
 * server-computed (an ego network the client cannot recompute), so there is
 * nothing correct to predict. Create is not optimistic for entities either, for
 * the same class of reason.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import type { EntityCollection } from "@/shared/api/endpoints"
import { invalidateAfterRelationship } from "@/shared/api/invalidation"
import { entityKindIdentity } from "@/shared/domain/entity-kinds"
import { relationshipTypeDefinition } from "@/shared/domain/relationships"
import type { RelationshipForm } from "@/shared/relationships/relationship.schema"
import { createRelationship } from "@/shared/relationships/relationships.api"

export interface CreateRelationshipVariables {
  form: RelationshipForm
  /**
   * Display names for the toast. The dialog already has them from the pickers,
   * and refetching two entities just to name them in a notification would be
   * two requests for a sentence.
   */
  sourceName: string
  targetName: string
}

export function useCreateRelationship() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ form }: CreateRelationshipVariables) => createRelationship(form),

    onSuccess: async (_relationship, { form, sourceName, targetName }) => {
      const definition = relationshipTypeDefinition(form.relType)
      const targetCollection = entityKindIdentity(definition.targetKind).collection

      await invalidateAfterRelationship(queryClient, [
        // The source is always a Character — the endpoint is rooted there.
        { collection: "characters" satisfies EntityCollection, id: form.sourceId },
        ...(targetCollection ? [{ collection: targetCollection, id: form.targetId }] : []),
      ])

      toast.success("Relationship created", {
        description: `${sourceName} ${definition.phrase} ${targetName}`,
      })
    },

    // The dialog shows the failure inline, next to the fields that caused it;
    // a toast would duplicate it and then disappear.
    meta: { suppressErrorToast: true },
  })
}
