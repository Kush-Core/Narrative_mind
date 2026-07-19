import { MapPinIcon } from "lucide-react"

import { locationsApi } from "@/features/locations/api/locations.api"
import { RegionBadge } from "@/features/locations/components/RegionBadge"
import {
  EMPTY_LOCATION_FORM,
  type Location,
  LOCATION_SORT_FIELDS,
  type LocationForm,
  LocationFormSchema,
  type LocationListParams,
  LocationListParamsSchema,
  toLocationForm,
} from "@/features/locations/model/location.schema"
import { paths } from "@/routes/paths"
import { entityKeys } from "@/shared/api/query-keys"
import type { EntityDescriptor } from "@/shared/entity-kit/types"
import { formatDateTime } from "@/shared/lib/date"

/**
 * Everything specific about Locations, in one declaration.
 *
 * This module is the whole Location module in the sense that matters: no list,
 * detail, form, dialog, pagination, search, or mutation code was written for
 * this entity. The generic screens read this object and behave identically to
 * Characters — which is the reuse claim the milestone set out to test.
 *
 * The one place Location did *not* fit the existing abstraction is its filter:
 * `region` is open-ended free text where `status` is a closed enum, which is why
 * `EntityFilterSpec` gained a `kind` discriminator (see `entity-kit/types.ts`).
 */
export const locationDescriptor: EntityDescriptor<Location, LocationForm, LocationListParams> = {
  collection: "locations",
  singular: "Location",
  plural: "Locations",
  icon: MapPinIcon,
  accentClassName: "text-entity-location",

  routes: {
    list: () => paths.locations.list(),
    detail: (id) => paths.locations.detail(id),
  },

  resource: locationsApi,
  keys: entityKeys("locations"),

  listParamsSchema: LocationListParamsSchema,
  formSchema: LocationFormSchema,
  emptyForm: EMPTY_LOCATION_FORM,
  toForm: toLocationForm,

  fields: [
    {
      name: "name",
      label: "Name",
      control: "text",
      placeholder: "Dunhollow",
      required: true,
      maxLength: 120,
    },
    {
      name: "region",
      label: "Region",
      control: "text",
      placeholder: "The Ashen Reach",
      description: "The broader territory this place belongs to. Used to group and filter places.",
      maxLength: 120,
    },
    {
      name: "description",
      label: "Description",
      control: "textarea",
      placeholder: "What stands here, who passes through, what it feels like to arrive…",
      maxLength: 2000,
      span: "full",
    },
  ],

  // Column ids that are sortable must match the backend's whitelist exactly,
  // or the sort would be silently ignored server-side.
  columns: [
    {
      id: "name",
      header: "Name",
      sortable: true,
      cell: (location) => <span className="font-medium text-foreground">{location.name}</span>,
    },
    {
      id: "region",
      header: "Region",
      sortable: true,
      cell: (location) => <RegionBadge region={location.region} />,
    },
    {
      id: "description",
      header: "Description",
      cell: (location) => (
        <span className="block max-w-md truncate text-muted-foreground">
          {location.description ?? "—"}
        </span>
      ),
    },
    {
      id: "created_at",
      header: "Created",
      sortable: true,
      cell: (location) => (
        <span className="text-muted-foreground">{formatDateTime(location.createdAt)}</span>
      ),
    },
  ],

  meta: [
    {
      id: "createdAt",
      label: "Created",
      value: (location) => formatDateTime(location.createdAt),
    },
    {
      id: "id",
      label: "Identifier",
      value: (location) => <code className="font-mono text-xs">{location.id}</code>,
    },
  ],

  sortableFields: LOCATION_SORT_FIELDS,

  filter: {
    // Free text, not an enum: the backend matches `region` by equality against
    // whatever the writer has typed, and exposes no endpoint to enumerate them.
    kind: "text",
    name: "region",
    label: "Filter by region",
    placeholder: "Exact region…",
  },

  getTitle: (location) => location.name,
  getSubtitle: (location) => (location.region ? `In ${location.region}` : undefined),

  emptyState: {
    title: "No locations yet",
    description: "Locations are the places of your world. Create the first one to begin.",
  },
}
