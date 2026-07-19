/**
 * The Faction resource layer.
 *
 * Configuration only — the shared factory supplies all five CRUD functions, and
 * this module contributes just the schema and the two mappers that are
 * genuinely Faction-specific.
 */

import {
  type Faction,
  type FactionForm,
  type FactionListParams,
  FactionSchema,
  toFactionCreateBody,
  toFactionUpdateBody,
} from "@/features/factions/model/faction.schema"
import { createEntityResource } from "@/shared/api/resource"
import { listParamsToQuery } from "@/shared/schemas/list-params.schema"

export const factionsApi = createEntityResource<
  Faction,
  FactionForm,
  Partial<FactionForm>,
  FactionListParams
>({
  collection: "factions",
  readSchema: FactionSchema,
  toCreateBody: toFactionCreateBody,
  toUpdateBody: toFactionUpdateBody,
  // `ideology` is already wire-identical, so the shared translator handles the
  // whole param set with no Faction-specific casing.
  toListQuery: (params) => listParamsToQuery(params),
})
