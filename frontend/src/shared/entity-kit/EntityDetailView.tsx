import { ArrowLeftIcon, PencilIcon, Trash2Icon } from "lucide-react"
import type { FieldValues } from "react-hook-form"
import { Link } from "react-router-dom"

import { isApiError } from "@/shared/api/api-error"
import { toUserMessage } from "@/shared/api/error-presentation"
import type { BaseListParams, EntityDescriptor, EntityFieldSpec } from "@/shared/entity-kit/types"
import { useEntityQuery } from "@/shared/entity-kit/useEntityQueries"
import type { Identifiable } from "@/shared/types/utility"
import { Button } from "@/shared/ui/button"
import { EmptyState } from "@/shared/ui/composite/EmptyState"
import { ErrorState } from "@/shared/ui/composite/ErrorState"
import { LoadingState } from "@/shared/ui/composite/LoadingState"
import { PageHeader } from "@/shared/ui/composite/PageHeader"
import { SectionLabel } from "@/shared/ui/composite/SectionLabel"

/**
 * The generic detail screen (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * Renders the descriptor's editable fields and its read-only meta facts, then
 * the entity-specific `detail` slot. Laying it out as labelled sections rather
 * than a bespoke design means a new field is a descriptor entry, and a new
 * *kind* of content (Character relationships in M5) is a slot — neither
 * requires redesigning the screen.
 *
 * A 404 is treated as a first-class state, not an error: the entity may have
 * been deleted from another view, so the user is offered the way back rather
 * than a failure message.
 */

interface EntityDetailViewProps<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
> {
  descriptor: EntityDescriptor<TRead, TForm, TListParams>
  id: string
  onEdit: (entity: TRead) => void
  onDelete: (entity: TRead) => void
}

export function EntityDetailView<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
>({ descriptor, id, onEdit, onDelete }: EntityDetailViewProps<TRead, TForm, TListParams>) {
  const query = useEntityQuery(descriptor, id)

  if (query.isPending) {
    return <LoadingState rows={6} label={`Loading ${descriptor.singular.toLowerCase()}`} />
  }

  if (query.isError) {
    const notFound = isApiError(query.error) && query.error.isNotFound

    return notFound ? (
      <EmptyState
        icon={descriptor.icon}
        title={`${descriptor.singular} not found`}
        description="It may have been deleted, or the link may be out of date."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to={descriptor.routes.list()}>Back to {descriptor.plural.toLowerCase()}</Link>
          </Button>
        }
      />
    ) : (
      <ErrorState
        title={`Could not load this ${descriptor.singular.toLowerCase()}`}
        description={toUserMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    )
  }

  const entity = query.data
  const subtitle = descriptor.getSubtitle?.(entity)

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title={descriptor.getTitle(entity)}
        description={subtitle}
        accentClassName={descriptor.accentClassName}
        actions={
          <>
            <Button asChild variant="ghost" size="sm">
              <Link to={descriptor.routes.list()}>
                <ArrowLeftIcon aria-hidden />
                All {descriptor.plural.toLowerCase()}
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => onEdit(entity)}>
              <PencilIcon aria-hidden />
              Edit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(entity)}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2Icon aria-hidden />
              Delete
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="flex max-w-4xl flex-col gap-6 p-5">
          <section className="flex flex-col gap-4">
            <SectionLabel>Details</SectionLabel>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {descriptor.fields.map((spec) => (
                <div key={spec.name} className={spec.span === "full" ? "sm:col-span-2" : undefined}>
                  <dt className="mb-1 text-xs text-muted-foreground">{spec.label}</dt>
                  <dd className="text-sm wrap-break-word whitespace-pre-wrap">
                    {renderFieldValue(entity, spec)}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {/* The escape hatch: entity-specific UI enters here, not through a
              conditional in this component.

              It sits above `Record` deliberately. This slot carries the entity's
              *substance* — Character's aliases today, and the narrative surfaces
              the Event module is shaped for (participants, locations, factions,
              AI annotations) as they arrive. `Record` is provenance: created-at
              and identifier, the least-read facts on the screen. Ordering by
              importance means a future section is added to the slot without
              anyone having to restructure this component. */}
          {descriptor.slots?.detail?.(entity)}

          {descriptor.meta && descriptor.meta.length > 0 ? (
            <section className="flex flex-col gap-4 border-t pt-6">
              <SectionLabel>Record</SectionLabel>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {descriptor.meta.map((spec) => (
                  <div key={spec.id}>
                    <dt className="mb-1 text-xs text-muted-foreground">{spec.label}</dt>
                    <dd className="text-sm wrap-break-word">{spec.value(entity)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/**
 * Render a field's value generically.
 *
 * Values arrive already mapped to the domain shape, so only presentation
 * remains. Two rules:
 *
 *  - A field with `options` is an enum, so the **label** is shown, not the wire
 *    value — a reader should see "Alive", not `alive`. Using the same options
 *    the form offers means the two surfaces can never disagree.
 *  - Types are handled explicitly rather than via a blanket `String()`, which
 *    would render `[object Object]` for a shape the descriptor did not
 *    anticipate. An em dash is a better failure than that.
 */
function renderFieldValue<TForm extends FieldValues>(
  entity: Record<string, unknown>,
  spec: EntityFieldSpec<TForm>,
): string {
  const value = entity[spec.name]

  if (value === null || value === undefined || value === "") return "—"

  if (spec.options && typeof value === "string") {
    return spec.options.find((option) => option.value === value)?.label ?? value
  }

  if (Array.isArray(value)) return value.length === 0 ? "—" : value.map(String).join(", ")
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return "—"
}
