/**
 * Generic query hooks — one implementation serving all four entities
 * (docs/frontend/COMPONENT_HIERARCHY.md §5, STATE_MANAGEMENT.md §2).
 *
 * These are the frontend twin of a backend service: they orchestrate fetching
 * and cache coherence over the resource layer, and own nothing about any
 * particular entity beyond what its descriptor declares.
 */

import { useQuery } from "@tanstack/react-query"
import type { FieldValues } from "react-hook-form"

import type { BaseListParams, EntityDescriptor } from "@/shared/entity-kit/types"
import type { Page } from "@/shared/schemas/page.schema"
import type { Identifiable } from "@/shared/types/utility"

/**
 * List query for an entity.
 *
 * `placeholderData` keeps the previous page on screen while the next one loads,
 * so paging and filtering never flash an empty table
 * (docs/frontend/API_INTEGRATION_PLAN.md §5). Callers distinguish the two
 * loading modes with `isPending` (nothing yet) vs `isFetching` (refreshing).
 */
export function useEntityListQuery<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
>(descriptor: EntityDescriptor<TRead, TForm, TListParams>, params: TListParams) {
  return useQuery<Page<TRead>>({
    queryKey: descriptor.keys.list(params),
    queryFn: ({ signal }) => descriptor.resource.list(params, { signal }),
    placeholderData: (previous) => previous,
  })
}

/**
 * Detail query for one entity.
 *
 * A 404 here is a real answer, not a transient failure — the entity may have
 * been deleted in another view — and the shared retry predicate already
 * declines to retry it.
 */
export function useEntityQuery<
  TRead extends Identifiable,
  TForm extends FieldValues,
  TListParams extends BaseListParams,
>(descriptor: EntityDescriptor<TRead, TForm, TListParams>, id: string | undefined) {
  return useQuery<TRead>({
    queryKey: descriptor.keys.detail(id ?? ""),
    queryFn: ({ signal }) => descriptor.resource.get(id ?? "", { signal }),
    enabled: id !== undefined && id !== "",
  })
}
