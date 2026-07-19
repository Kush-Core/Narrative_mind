/**
 * The relationship resource layer.
 *
 * A plain function over the shared `httpClient`, deliberately not
 * `createEntityResource`: relationships have no list, no detail, no update and
 * no delete endpoint — only a create, rooted at a Character. There is no CRUD
 * shape here to factor out, which is precisely the case
 * docs/frontend/API_INTEGRATION_PLAN.md §1 reserves for hand-written functions.
 */

import { endpoints } from "@/shared/api/endpoints"
import { httpClient } from "@/shared/api/http-client"
import type { RelationshipForm } from "@/shared/relationships/relationship.schema"
import {
  type Relationship,
  RelationshipSchema,
  toRelationshipBody,
} from "@/shared/relationships/relationship.schema"

export interface RelationshipCallOptions {
  signal?: AbortSignal
}

/**
 * Create one relationship.
 *
 * The source is a path segment, not a body field, because the backend exposes
 * this as a sub-resource of the character
 * (`POST /characters/{id}/relationships`). The write is a `MERGE`, so repeating
 * it is idempotent for a given `(source, type, target)` — it updates the
 * sentiment rather than creating a second edge.
 */
export function createRelationship(
  form: RelationshipForm,
  options: RelationshipCallOptions = {},
): Promise<Relationship> {
  return httpClient.post<Relationship>(
    endpoints.characters.relationships(form.sourceId),
    toRelationshipBody(form),
    { schema: RelationshipSchema, signal: options.signal },
  )
}
