/**
 * The Location resource layer.
 *
 * Nothing here is transport code: the shared factory supplies all five CRUD
 * functions, and this module contributes only what is genuinely
 * Location-specific — its schema and its mappers. Compare with
 * `characters.api.ts`: the two are the same eight lines with different names,
 * which is the result the entity abstraction was built for.
 */

import {
  type Location,
  type LocationForm,
  type LocationListParams,
  LocationSchema,
  toLocationCreateBody,
  toLocationUpdateBody,
} from "@/features/locations/model/location.schema"
import { createEntityResource } from "@/shared/api/resource"
import { listParamsToQuery } from "@/shared/schemas/list-params.schema"

export const locationsApi = createEntityResource<
  Location,
  LocationForm,
  Partial<LocationForm>,
  LocationListParams
>({
  collection: "locations",
  readSchema: LocationSchema,
  toCreateBody: toLocationCreateBody,
  toUpdateBody: toLocationUpdateBody,
  // `region` is already wire-identical, so the shared translator handles the
  // whole param set with no Location-specific casing.
  toListQuery: (params) => listParamsToQuery(params),
})
