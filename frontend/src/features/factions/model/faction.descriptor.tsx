import { FlagIcon } from "lucide-react"

import { factionsApi } from "@/features/factions/api/factions.api"
import {
  EMPTY_FACTION_FORM,
  type Faction,
  FACTION_SORT_FIELDS,
  type FactionForm,
  FactionFormSchema,
  type FactionListParams,
  FactionListParamsSchema,
  toFactionForm,
} from "@/features/factions/model/faction.schema"
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

/**
 * Everything specific about Factions, in one declaration.
 *
 * This is the whole Faction module: no screens, no components, no hooks. Every
 * column and meta row is a shared builder, both mappers are shared wire
 * helpers, and the filter is the `kind: "text"` variant M4 added for Location.
 * Faction introduced no new infrastructure at all — the consolidation goal for
 * this milestone, demonstrated rather than asserted.
 */
export const factionDescriptor: EntityDescriptor<Faction, FactionForm, FactionListParams> = {
  collection: "factions",
  singular: "Faction",
  plural: "Factions",
  icon: FlagIcon,
  accentClassName: "text-entity-faction",

  routes: {
    list: () => paths.factions.list(),
    detail: (id) => paths.factions.detail(id),
  },

  resource: factionsApi,
  keys: entityKeys("factions"),

  listParamsSchema: FactionListParamsSchema,
  formSchema: FactionFormSchema,
  emptyForm: EMPTY_FACTION_FORM,
  toForm: toFactionForm,

  fields: [
    {
      name: "name",
      label: "Name",
      control: "text",
      placeholder: "The Iron Pact",
      required: true,
      maxLength: 120,
    },
    {
      // A textarea rather than an input: 500 characters is a stated creed, not
      // a label, and the control should invite the longer answer.
      name: "ideology",
      label: "Ideology",
      control: "textarea",
      placeholder: "What they believe, and what they will do about it…",
      description: "The belief that binds this faction together.",
      maxLength: 500,
      span: "full",
    },
    {
      name: "description",
      label: "Description",
      control: "textarea",
      placeholder: "Who they are, how they are organised, who opposes them…",
      maxLength: 2000,
      span: "full",
    },
  ],

  // Column ids that are sortable must match the backend's whitelist exactly,
  // or the sort would be silently ignored server-side.
  columns: [
    nameColumn({ get: (faction) => faction.name }),
    truncatedTextColumn({
      id: "ideology",
      header: "Ideology",
      get: (faction) => faction.ideology,
      sortable: true,
      className: "max-w-xs",
    }),
    truncatedTextColumn({
      id: "description",
      header: "Description",
      get: (faction) => faction.description,
    }),
    createdAtColumn((faction) => faction.createdAt),
  ],

  meta: [createdAtMeta((faction) => faction.createdAt), identifierMeta()],

  sortableFields: FACTION_SORT_FIELDS,

  filter: {
    // Free text, not an enum: the backend matches `ideology` by equality against
    // whatever the writer has typed, and exposes no endpoint to enumerate them.
    kind: "text",
    name: "ideology",
    label: "Filter by ideology",
    placeholder: "Exact ideology…",
  },

  getTitle: (faction) => faction.name,
  getSubtitle: (faction) => faction.ideology ?? undefined,

  emptyState: {
    title: "No factions yet",
    description: "Factions are the powers of your world. Create the first one to begin.",
  },
}
