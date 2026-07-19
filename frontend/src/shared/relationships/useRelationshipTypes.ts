/**
 * Where relationship types come from.
 *
 * The backend currently exposes **no endpoint that enumerates them**: the set
 * lives in `_ALLOWED_REL_TYPES`, a Python constant inside `GraphService`, and is
 * only observable by having a write rejected. So the catalog is defined
 * client-side in `shared/domain/relationships.ts`.
 *
 * This hook exists anyway, and every consumer goes through it rather than
 * importing the constant, because the *shape* of the answer is what callers
 * should depend on — a list that may be loading, may fail, and may one day come
 * from the network. Reading the constant directly at each call site would mean
 * that when `GET /relationship-types` appears, every component that renders a
 * type would need to learn about loading and error states at once.
 *
 * With this seam, that change is confined to this file:
 *
 *     const query = useQuery({ queryKey: queryKeys.relationshipTypes(), ... })
 *     return { types: query.data ?? [], isPending: query.isPending, error: query.error }
 *
 * The static implementation reports `isPending: false` and never errors, which
 * is the honest description of a constant.
 */

import { useMemo } from "react"

import {
  RELATIONSHIP_TYPE_DEFINITIONS,
  type RelationshipAnchor,
  type RelationshipTypeDefinition,
  relationshipTypesForAnchor,
} from "@/shared/domain/relationships"

export interface RelationshipTypesResult {
  types: RelationshipTypeDefinition[]
  isPending: boolean
  error: unknown
}

/**
 * The relationship types available, optionally narrowed to those that make
 * sense for the entity a dialog was opened from.
 *
 * @param anchor When the pinned entity is a relationship's *target* (anything
 *   but a Character), only the types that point at its kind are offered — see
 *   `relationshipTypesForAnchor`.
 */
export function useRelationshipTypes(anchor?: RelationshipAnchor): RelationshipTypesResult {
  const types = useMemo(
    () => (anchor ? relationshipTypesForAnchor(anchor) : RELATIONSHIP_TYPE_DEFINITIONS),
    [anchor],
  )

  return { types, isPending: false, error: null }
}
