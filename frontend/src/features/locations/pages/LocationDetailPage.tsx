import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { locationDescriptor } from "@/features/locations/model/location.descriptor"
import type { Location } from "@/features/locations/model/location.schema"
import { EntityDetailView } from "@/shared/entity-kit/EntityDetailView"
import { EntityFormDialog } from "@/shared/entity-kit/EntityFormDialog"
import { useEntityMutations } from "@/shared/entity-kit/useEntityMutations"
import { ConfirmDialog } from "@/shared/ui/composite/ConfirmDialog"

/**
 * The Location detail screen — thin for the same reason as the list.
 *
 * It owns the edit and delete dialog state and the post-delete navigation,
 * because "where to go once this record no longer exists" is a decision the
 * generic view cannot make. Everything else is descriptor-driven.
 */
export function LocationDetailPage() {
  const { locationId } = useParams<{ locationId: string }>()
  const navigate = useNavigate()

  const [editing, setEditing] = useState<Location | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<Location | undefined>(undefined)
  const { remove } = useEntityMutations(locationDescriptor)

  if (!locationId) return null

  function handleConfirmDelete() {
    if (!pendingDelete) return
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        setPendingDelete(undefined)
        void navigate(locationDescriptor.routes.list())
      },
      // On failure the dialog stays open with the error toasted, so the user
      // can retry or cancel rather than losing the context.
    })
  }

  return (
    <>
      <EntityDetailView
        descriptor={locationDescriptor}
        id={locationId}
        onEdit={setEditing}
        onDelete={setPendingDelete}
      />

      <EntityFormDialog
        descriptor={locationDescriptor}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        entity={editing}
      />

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
        title={`Delete ${pendingDelete?.name ?? "location"}?`}
        description="This permanently removes the location and every relationship connected to it. This cannot be undone."
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
