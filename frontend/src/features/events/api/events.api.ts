/**
 * The Event resource layer.
 *
 * Configuration only — the shared factory supplies all five CRUD functions, and
 * this module contributes just the schema and the two mappers that are
 * genuinely Event-specific.
 */

import {
  type Event,
  type EventForm,
  type EventListParams,
  EventSchema,
  toEventCreateBody,
  toEventUpdateBody,
} from "@/features/events/model/event.schema"
import { createEntityResource } from "@/shared/api/resource"
import { listParamsToQuery } from "@/shared/schemas/list-params.schema"

export const eventsApi = createEntityResource<
  Event,
  EventForm,
  Partial<EventForm>,
  EventListParams
>({
  collection: "events",
  readSchema: EventSchema,
  toCreateBody: toEventCreateBody,
  toUpdateBody: toEventUpdateBody,
  // Event carries no categorical filter, so the shared translator handles the
  // entire param set — `sortBy` already holds the wire field name.
  toListQuery: (params) => listParamsToQuery(params),
})
