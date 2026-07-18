import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { characterDescriptor } from "@/features/characters/model/character.descriptor"
import type { Character } from "@/features/characters/model/character.schema"
import { EntityFormDialog } from "@/shared/entity-kit/EntityFormDialog"
import { EntityListView } from "@/shared/entity-kit/EntityListView"

/**
 * The Character list screen — deliberately thin.
 *
 * All behaviour (URL-driven filters, sorting, pagination, empty/error/loading
 * states) comes from `EntityListView` reading the descriptor. This page exists
 * only to own the create-dialog state and decide where a new character sends
 * the user. Locations, Factions, and Events will each be this file with a
 * different descriptor.
 */
export function CharacterListPage() {
  const navigate = useNavigate()
  const [isCreateOpen, setCreateOpen] = useState(false)

  return (
    <>
      <EntityListView descriptor={characterDescriptor} onCreate={() => setCreateOpen(true)} />

      <EntityFormDialog
        descriptor={characterDescriptor}
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        // Land on the new character: creating one is almost always the prelude
        // to writing about it.
        onCreated={(character: Character) =>
          void navigate(characterDescriptor.routes.detail(character.id))
        }
      />
    </>
  )
}
