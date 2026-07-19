import { characterDescriptor } from "@/features/characters/model/character.descriptor"
import { EntityDetailPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Character detail screen.
 *
 * The record, the edit dialog, and the delete confirmation all come from the
 * generic CRUD screen. Character-specific content — the alias list today, the
 * relationship editor in M5 — enters through the descriptor's `detail` slot
 * rather than through this file.
 */
export function CharacterDetailPage() {
  return <EntityDetailPage descriptor={characterDescriptor} />
}
