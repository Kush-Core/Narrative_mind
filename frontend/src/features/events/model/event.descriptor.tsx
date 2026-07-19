import { CalendarClockIcon } from "lucide-react"

import { eventsApi } from "@/features/events/api/events.api"
import { TimelinePositionBadge } from "@/features/events/components/TimelinePositionBadge"
import {
  EMPTY_EVENT_FORM,
  type Event,
  EVENT_SORT_FIELDS,
  type EventForm,
  EventFormSchema,
  type EventListParams,
  EventListParamsSchema,
  toEventForm,
} from "@/features/events/model/event.schema"
import { paths } from "@/routes/paths"
import { entityKeys } from "@/shared/api/query-keys"
import {
  createdAtColumn,
  createdAtMeta,
  identifierMeta,
  nameColumn,
  truncatedTextColumn,
} from "@/shared/entity-kit/columns"
import type { EntityDescriptor } from "@/shared/entity-kit/types"
import { RelationshipsSection } from "@/shared/relationships"

/**
 * Everything specific about Events, in one declaration.
 *
 * Events are the narrative backbone, and the module is shaped so that becoming
 * one does not require a redesign:
 *
 *  - **Timeline position is first-class**, not an afterthought field: it is the
 *    default sort, the leading column, and the subtitle on the detail screen.
 *    A future timeline visualization reads the same `timelineOrder` and the same
 *    `sort_by=timeline_order` list query this module already uses.
 *  - **The `detail` slot is the expansion seam.** Participants, referenced
 *    locations, involved factions, and AI annotations all attach there — above
 *    the Record section — as separate sections, with no change to
 *    `EntityDetailView`. Nothing is stubbed today; the shape simply admits them.
 *  - **Relationships stay a graph concern.** The backend roots relationship
 *    writes at Character (`POST /characters/{id}/relationships`), so Event does
 *    not invent a write path it does not have. Reads of an event's participants
 *    will come from the graph feature and render into the slot.
 */
export const eventDescriptor: EntityDescriptor<Event, EventForm, EventListParams> = {
  collection: "events",
  singular: "Event",
  plural: "Events",
  icon: CalendarClockIcon,
  accentClassName: "text-entity-event",

  routes: {
    list: () => paths.events.list(),
    detail: (id) => paths.events.detail(id),
  },

  resource: eventsApi,
  keys: entityKeys("events"),

  listParamsSchema: EventListParamsSchema,
  formSchema: EventFormSchema,
  emptyForm: EMPTY_EVENT_FORM,
  toForm: toEventForm,

  fields: [
    {
      name: "name",
      label: "Name",
      control: "text",
      placeholder: "The Sundering",
      required: true,
      maxLength: 120,
    },
    {
      name: "timelineOrder",
      label: "Timeline position",
      control: "number",
      placeholder: "0",
      description:
        "Relative position on the world timeline. Lower comes first; negative values are allowed for prehistory.",
      required: true,
    },
    {
      name: "summary",
      label: "Summary",
      control: "textarea",
      placeholder: "What happened, to whom, and what it changed…",
      maxLength: 2000,
      span: "full",
    },
  ],

  // Column ids that are sortable must match the backend's whitelist exactly,
  // or the sort would be silently ignored server-side. Note `timeline_order` is
  // the *wire* name, as `sort_by` is sent verbatim.
  columns: [
    {
      id: "timeline_order",
      header: "#",
      sortable: true,
      cell: (event) => <TimelinePositionBadge order={event.timelineOrder} />,
      className: "w-20",
    },
    nameColumn({ get: (event) => event.name }),
    truncatedTextColumn({
      id: "summary",
      header: "Summary",
      get: (event) => event.summary,
      className: "max-w-lg",
    }),
    createdAtColumn((event) => event.createdAt),
  ],

  meta: [createdAtMeta((event) => event.createdAt), identifierMeta()],

  sortableFields: EVENT_SORT_FIELDS,

  // No `filter`: the events list endpoint accepts `name_contains` only.

  getTitle: (event) => event.name,
  getSubtitle: (event) => `Timeline position ${event.timelineOrder}`,

  emptyState: {
    title: "No events yet",
    description:
      "Events are what happens in your world — the spine everything else hangs from. Create the first one to begin.",
  },

  slots: {
    // Relationships are Character-rooted in the backend, so this event is the
    // relationship's *target* — the section resolves that from the kind.
    detail: (event) => <RelationshipsSection kind="Event" id={event.id} name={event.name} />,
  },
}
