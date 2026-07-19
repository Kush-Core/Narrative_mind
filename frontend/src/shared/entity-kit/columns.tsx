/**
 * Column and meta-row builders for entity descriptors
 * (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * Every entity has a name column, a truncated free-text column or two, and a
 * created timestamp — written identically in each descriptor. These builders
 * make that shape declared rather than retyped, so a change to how a date or a
 * long string reads in a table happens once for all four entities.
 *
 * They are **builders, not components**: each returns a plain descriptor spec,
 * so a descriptor can always drop to a hand-written `cell` when an entity needs
 * something these do not express (Character's alias sub-label, Location's region
 * badge). Reaching for the escape hatch stays cheap, which is what keeps these
 * from becoming a straitjacket.
 *
 * A note on `id`s: a column's `id` is also its `sort_by` value on the wire, so
 * the ids here are the backend's field names (`name`, `created_at`), not
 * camelCase. Marking a column `sortable` that the backend does not whitelist
 * would leave the sort silently ignored.
 */

import type { ReactNode } from "react"

import type { EntityColumnSpec, EntityMetaSpec } from "@/shared/entity-kit/types"
import { formatDateTime } from "@/shared/lib/date"
import type { Identifiable } from "@/shared/types/utility"

/** Placeholder for an absent value, used consistently across tables and detail. */
const EMPTY = "—"

/**
 * The primary identifying column: the name, emphasised, with an optional
 * secondary line beneath it for entities that carry a subtitle.
 */
export function nameColumn<TRead>(options: {
  get: (entity: TRead) => string
  /** Rendered smaller, below the name. Return `null` to omit for a given row. */
  secondary?: (entity: TRead) => ReactNode
  header?: string
}): EntityColumnSpec<TRead> {
  const { get, secondary, header = "Name" } = options

  return {
    id: "name",
    header,
    sortable: true,
    cell: (entity) => {
      const below = secondary?.(entity)
      return (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{get(entity)}</span>
          {below ? <span className="text-2xs text-muted-foreground">{below}</span> : null}
        </div>
      )
    },
  }
}

/**
 * A free-text column clipped to a single line.
 *
 * Descriptions and ideologies run to hundreds of characters; a table row is not
 * where they are read, so they are truncated here and shown in full on the
 * detail screen.
 */
export function truncatedTextColumn<TRead>(options: {
  id: string
  header: string
  get: (entity: TRead) => string | null | undefined
  sortable?: boolean
  /** Widen or narrow the clip; defaults to a comfortable prose measure. */
  className?: string
}): EntityColumnSpec<TRead> {
  const { id, header, get, sortable = false, className = "max-w-md" } = options

  return {
    id,
    header,
    sortable,
    cell: (entity) => (
      <span className={`block truncate text-muted-foreground ${className}`}>
        {get(entity) || EMPTY}
      </span>
    ),
  }
}

/** The `created_at` column, formatted and sortable — identical for every entity. */
export function createdAtColumn<TRead>(
  get: (entity: TRead) => string,
  header = "Created",
): EntityColumnSpec<TRead> {
  return {
    id: "created_at",
    header,
    sortable: true,
    cell: (entity) => <span className="text-muted-foreground">{formatDateTime(get(entity))}</span>,
  }
}

/* ------------------------------------------------------------- meta builders */

/** The "Created" fact on the detail screen's Record section. */
export function createdAtMeta<TRead>(get: (entity: TRead) => string): EntityMetaSpec<TRead> {
  return {
    id: "createdAt",
    label: "Created",
    value: (entity) => formatDateTime(get(entity)),
  }
}

/**
 * The entity's identifier, monospaced.
 *
 * Worth showing on every entity: it is what a writer copies when reporting a
 * problem or wiring a relationship by hand.
 */
export function identifierMeta<TRead extends Identifiable>(): EntityMetaSpec<TRead> {
  return {
    id: "id",
    label: "Identifier",
    value: (entity) => <code className="font-mono text-xs">{entity.id}</code>,
  }
}
