import { characterDescriptor } from "@/features/characters/model/character.descriptor"
import { EntityListPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Character list screen.
 *
 * Everything it does — URL-driven search and filtering, sorting, pagination,
 * the create dialog, the empty/loading/error states — is the generic CRUD
 * screen reading the descriptor. This file exists to name the binding and to be
 * the slice's stable public surface.
 */
export function CharacterListPage() {
  return <EntityListPage descriptor={characterDescriptor} />
}
