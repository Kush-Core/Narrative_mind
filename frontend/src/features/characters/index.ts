/**
 * Public surface of the `characters` slice.
 *
 * Other modules import from `@/features/characters` and never from its
 * internals (docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3). Keeping the
 * surface this small is what lets the slice change shape without rippling.
 */

export { characterDescriptor } from "@/features/characters/model/character.descriptor"
export type {
  Character,
  CharacterForm,
  CharacterStatus,
} from "@/features/characters/model/character.schema"
export { CharacterDetailPage } from "@/features/characters/pages/CharacterDetailPage"
export { CharacterListPage } from "@/features/characters/pages/CharacterListPage"
