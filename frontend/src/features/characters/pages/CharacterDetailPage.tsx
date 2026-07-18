import { useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

import { characterDescriptor } from "@/features/characters/model/character.descriptor"
import type { Character } from "@/features/characters/model/character.schema"
import { EntityDetailView } from "@/shared/entity-kit/EntityDetailView"
import { EntityFormDialog } from "@/shared/entity-kit/EntityFormDialog"
import { useEntityMutations } from "@/shared/entity-kit/useEntityMutations"
import { ConfirmDialog } from "@/shared/ui/composite/ConfirmDialog"

/**
 * The Character detail screen — thin for the same reason as the list.
 *
 * It owns the edit and delete dialog state and the post-delete navigation,
 * because "where to go once this record no longer exists" is a decision the
 * generic view cannot make. Everything else is descriptor-driven.
 */
export function CharacterDetailPage() {
  const { characterId } = useParams<{ characterId: string }>()
  const navigate = useNavigate()

  const [editing, setEditing] = useState<Character | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<Character | undefined>(undefined)
  const { remove } = useEntityMutations(characterDescriptor)

  if (!characterId) return null

  function handleConfirmDelete() {
    if (!pendingDelete) return
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        setPendingDelete(undefined)
        void navigate(characterDescriptor.routes.list())
      },
      // On failure the dialog stays open with the error toasted, so the user
      // can retry or cancel rather than losing the context.
    })
  }

  return (
    <>
      <EntityDetailView
        descriptor={characterDescriptor}
        id={characterId}
        onEdit={setEditing}
        onDelete={setPendingDelete}
      />

      <EntityFormDialog
        descriptor={characterDescriptor}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        entity={editing}
      />

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
        title={`Delete ${pendingDelete?.name ?? "character"}?`}
        description="This permanently removes the character and every relationship connected to it. This cannot be undone."
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
