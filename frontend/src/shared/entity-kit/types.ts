/**
 * The `EntityDescriptor` contract — the single most important DRY boundary in
 * the app (docs/frontend/FRONTEND_ARCHITECTURE.md D3,
 * COMPONENT_HIERARCHY.md §5).
 *
 * The backend's four entity services are byte-for-byte parallel; their only
 * differences are **declarative** — field set, one categorical filter, a
 * sortable-field whitelist. Those differences are data, so they live in a
 * descriptor rather than in four copy-pasted CRUD stacks.
 *
 * The rule that keeps the generic engine clean: entity-specific behaviour
 * enters through **slots and descriptor data**, never through conditionals in
 * the engine. There is no `if (entity === "character")` anywhere in
 * `entity-kit/`, and there must never be one.
 */

import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { FieldValues, Path } from "react-hook-form"
import type { z } from "zod"

import type { EntityCollection } from "@/shared/api/endpoints"
import type { entityKeys } from "@/shared/api/query-keys"
import type { EntityResource } from "@/shared/api/resource"
import type { Identifiable } from "@/shared/types/utility"

/**
 * The list-param core every collection shares.
 *
 * Declared as a **type alias rather than an interface** on purpose: an alias
 * carries an implicit index signature, so params derived from it remain
 * assignable to `Record<string, unknown>` for query-key normalization. An
 * interface would not, and every call site would need a cast.
 */
export type BaseListParams = {
  limit: number
  offset: number
  sortBy: string
  order: "asc" | "desc"
}

/** Controls the generic form knows how to render. */
export type FieldControl = "text" | "textarea" | "select" | "tags" | "number"

export interface SelectOption {
  value: string
  label: string
}

/**
 * A top-level form field name.
 *
 * The intersection is load-bearing: `keyof` makes the name usable as an index
 * (reading its error and its current value), while `Path` makes it accept­able
 * to React Hook Form's `register`/`Controller`. Requiring both also confines
 * field specs to top-level fields, which is all the descriptor engine renders.
 */
export type EntityFieldName<TForm extends FieldValues> = Extract<keyof TForm, string> & Path<TForm>

/**
 * What an assist affordance is given to work with.
 *
 * Deliberately not the whole form object. An assist needs to read a couple of
 * sibling fields and write one — handing it `useForm`'s return would let it
 * reach into validation, submission, and reset, none of which is its business,
 * and would couple every assist to React Hook Form.
 */
export interface FieldAssistContext {
  /** The current value of the field this assist belongs to. */
  value: unknown
  /** Read a sibling field — an entity's name, its status. */
  readField: (name: string) => unknown
  /** Write a produced value into this field, marking the form dirty. */
  apply: (value: string) => void
  /** True while the form is submitting. */
  disabled: boolean
}

/**
 * One editable field: how to label it, how to render it, and what the backend's
 * constraints are. Validation itself lives in the Zod schema — these are the
 * *presentation* facts that a schema cannot express.
 */
export interface EntityFieldSpec<TForm extends FieldValues> {
  name: EntityFieldName<TForm>
  label: string
  control: FieldControl
  placeholder?: string
  description?: string
  /** Mirrors the backend bound; drives the live character counter. */
  maxLength?: number
  /** Mirrors the backend bound for list fields (aliases: 10). */
  maxItems?: number
  options?: readonly SelectOption[]
  required?: boolean
  /** Full-width fields (textareas, tag lists) break the two-column grid. */
  span?: "half" | "full"
  /**
   * An affordance rendered in this field's label row — today, the AI describe
   * assist.
   *
   * A render prop rather than a flag, for the same reason `slots` is: the engine
   * must not learn what an assist *is*. `EntityForm` places whatever this
   * returns and knows nothing more, so adding a second kind of assist later
   * needs no change here, and `entity-kit` never imports a feature slice.
   */
  assist?: (context: FieldAssistContext) => ReactNode
}

/** One list column. `cell` renders from the entity; sorting is server-side. */
export interface EntityColumnSpec<TRead> {
  id: string
  header: string
  cell: (entity: TRead) => ReactNode
  /** Only meaningful when `id` is also in `sortableFields`. */
  sortable?: boolean
  className?: string
}

/** A read-only fact shown on the detail screen (computed or system fields). */
export interface EntityMetaSpec<TRead> {
  id: string
  label: string
  value: (entity: TRead) => ReactNode
}

interface EntityFilterBase {
  /** URL/query param name — wire-identical (`status`, `region`, `ideology`). */
  name: string
  label: string
}

/**
 * A filter over a **closed** set of values, rendered as a select.
 * Character's `status` is the case: three enum members, known ahead of time.
 */
export interface EntitySelectFilterSpec extends EntityFilterBase {
  kind: "select"
  options: readonly SelectOption[]
  /** Label for the "no filter" choice. */
  allLabel: string
}

/**
 * A filter over an **open-ended** value, rendered as a debounced text input.
 *
 * Location's `region` is the case: the backend types it as `str | None` and
 * matches it by equality (`l.region = $region`), so its value set is whatever
 * the writer has typed across the world. There is no endpoint that enumerates
 * it, so a select is not expressible — which is precisely why the filter spec
 * is a discriminated union rather than an options list.
 */
export interface EntityTextFilterSpec extends EntityFilterBase {
  kind: "text"
  placeholder?: string
}

/** The categorical filter a collection supports, if any. */
export type EntityFilterSpec = EntitySelectFilterSpec | EntityTextFilterSpec

/**
 * Entity-specific UI injected into the generic screens. These are the escape
 * hatches that keep the engine free of per-entity branches — Character's
 * relationship editor lands in `detail` when M5 arrives.
 */
export interface EntitySlots<TRead> {
  /** Rendered below the detail fields. */
  detail?: (entity: TRead) => ReactNode
  /** Rendered in the list toolbar, after the shared filters. */
  listToolbar?: () => ReactNode
}

export interface EntityDescriptor<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
> {
  /** Stable identity, used for keys, copy, and route lookup. */
  collection: EntityCollection
  singular: string
  plural: string
  icon: LucideIcon
  /** Token-backed accent class carrying this entity's identity colour. */
  accentClassName?: string

  routes: {
    list: () => string
    detail: (id: string) => string
  }

  /** The resource layer and cache keys for this collection. */
  resource: EntityResource<TRead, TForm, Partial<TForm>, TListParams>
  keys: ReturnType<typeof entityKeys>

  /** Validates URL list params; also supplies their defaults. */
  listParamsSchema: z.ZodType<TListParams>
  /** Validates the create/edit form. One schema, both modes. */
  formSchema: z.ZodType<TForm, TForm>
  /** Blank form values for the create flow. */
  emptyForm: TForm
  /** Existing entity → form values for the edit flow. */
  toForm: (entity: TRead) => TForm

  fields: EntityFieldSpec<TForm>[]
  columns: EntityColumnSpec<TRead>[]
  meta?: EntityMetaSpec<TRead>[]
  /** Sort fields the backend actually honours — anything else it ignores. */
  sortableFields: readonly string[]
  filter?: EntityFilterSpec

  /** Primary display name for headings, toasts, and confirmations. */
  getTitle: (entity: TRead) => string
  /** Optional secondary line under the title on the detail screen. */
  getSubtitle?: (entity: TRead) => string | undefined

  /** Copy for the empty list, which is the entity's first-run experience. */
  emptyState: {
    title: string
    description: string
  }

  slots?: EntitySlots<TRead>
}

/**
 * A descriptor with its generics erased, for code that handles "some entity"
 * without caring which — never used to *build* one.
 */
export type AnyEntityDescriptor = EntityDescriptor<
  Identifiable,
  Record<string, unknown>,
  BaseListParams
>
