/**
 * Relationship management — the public surface.
 *
 * A cross-cutting capability rather than a feature slice: all four entity types
 * open the same dialog, so it lives in `shared/` where any of them may reach it
 * without depending on another slice
 * (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.4).
 *
 * The module is deliberately shaped like a slice inside — schema, api, queries,
 * ui — because it has all four concerns. What it does not have is an entity, so
 * it is not one.
 */

export {
  type Relationship,
  type RelationshipForm,
  RelationshipFormSchema,
  RelationshipSchema,
  SENTIMENT_MAX_LENGTH,
  toRelationshipBody,
} from "@/shared/relationships/relationship.schema"
export { RelationshipDialog } from "@/shared/relationships/RelationshipDialog"
export { createRelationship } from "@/shared/relationships/relationships.api"
export { RelationshipsSection } from "@/shared/relationships/RelationshipsSection"
export { useCreateRelationship } from "@/shared/relationships/useCreateRelationship"
export { useRelationshipTypes } from "@/shared/relationships/useRelationshipTypes"
