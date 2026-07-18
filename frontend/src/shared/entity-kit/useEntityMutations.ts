/**
 * Generic create / update / delete, with the cache-coherence policy applied
 * once (docs/frontend/API_INTEGRATION_PLAN.md §6, STATE_MANAGEMENT.md §2).
 *
 * Two backend facts shape the update path
 * (docs/frontend/API_INTEGRATION_PLAN.md §3, gotchas #3 and #4):
 *   - PATCH bodies must carry **only changed fields**, and
 *   - an empty update is rejected with a 422,
 * so `update` diffs against the loaded entity and **short-circuits entirely**
 * when nothing changed — saving an untouched form issues no request at all.
 *
 * On optimism: create and delete are *not* optimistic. Both shift `total` and
 * page membership, so a predicted list would be wrong in ways the user notices
 * (a row in the wrong sort position, a stale count). Update *is* optimistic on
 * the detail key only, where the new value is known exactly and the blast
 * radius is one screen. That is the "only if appropriate" line.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

import { toApiError } from "@/shared/api/error-presentation"
import {
  invalidateAfterCreate,
  invalidateAfterDelete,
  invalidateAfterUpdate,
} from "@/shared/api/invalidation"
import { diffForUpdate } from "@/shared/api/resource"
import type { BaseListParams, EntityDescriptor } from "@/shared/entity-kit/types"
import type { Identifiable, UnknownRecord } from "@/shared/types/utility"

export interface UpdateVariables<TForm> {
  id: string
  /** The entity as loaded — the baseline the new values are diffed against. */
  original: TForm
  values: TForm
}

export function useEntityMutations<
  TRead extends Identifiable,
  TForm extends UnknownRecord,
  TListParams extends BaseListParams,
>(descriptor: EntityDescriptor<TRead, TForm, TListParams>) {
  const queryClient = useQueryClient()
  const { collection, singular, resource } = descriptor

  const create = useMutation({
    mutationFn: (values: TForm) => resource.create(values),
    onSuccess: async (created) => {
      // Seed the detail cache so navigating straight to the new entity is
      // instant, then let the lists refetch — their totals and ordering moved.
      queryClient.setQueryData(descriptor.keys.detail(created.id), created)
      await invalidateAfterCreate(queryClient, collection)
      toast.success(`${singular} created`, { description: descriptor.getTitle(created) })
    },
    // Forms surface field errors inline; a toast would duplicate them.
    meta: { suppressErrorToast: true },
  })

  const update = useMutation({
    mutationFn: ({ id, original, values }: UpdateVariables<TForm>) => {
      const patch = diffForUpdate(original, values)
      if (patch === null) {
        // Nothing changed. Resolve with `null` as the explicit "no-op" signal
        // rather than echoing the cached entity back — that would be
        // indistinguishable from a real save and would report a change that
        // never happened.
        return Promise.resolve(null)
      }
      return resource.update(id, patch)
    },
    onSuccess: async (updated, { id }) => {
      if (updated === null) {
        toast.info("No changes to save")
        return
      }
      await invalidateAfterUpdate(queryClient, collection, id, updated)
      toast.success(`${singular} updated`, { description: descriptor.getTitle(updated) })
    },
    meta: { suppressErrorToast: true },
  })

  const remove = useMutation({
    mutationFn: (id: string) => resource.remove(id),
    onSuccess: async (_result, id) => {
      await invalidateAfterDelete(queryClient, collection, id)
      toast.success(`${singular} deleted`)
    },
    onError: (error) => {
      // Deletion is triggered from a dialog, not a form, so there is nowhere to
      // put a field error — a toast is the right surface here.
      const apiError = toApiError(error)
      toast.error(`Could not delete ${singular.toLowerCase()}`, {
        description: apiError.isNotFound ? "It may already have been deleted." : apiError.message,
      })
    },
  })

  return { create, update, remove }
}
