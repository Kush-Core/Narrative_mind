/**
 * The Character resource layer.
 *
 * Almost nothing to write: the shared factory supplies the five CRUD functions,
 * and this module contributes only what is genuinely Character-specific — its
 * schema and its four mappers. That is the payoff of M2's infrastructure, and
 * the template Locations, Factions, and Events follow.
 */

import {
  type Character,
  type CharacterForm,
  type CharacterListParams,
  CharacterSchema,
  toCharacterCreateBody,
  toCharacterUpdateBody,
} from "@/features/characters/model/character.schema"
import { createEntityResource } from "@/shared/api/resource"
import { listParamsToQuery } from "@/shared/schemas/list-params.schema"

export const charactersApi = createEntityResource<
  Character,
  CharacterForm,
  Partial<CharacterForm>,
  CharacterListParams
>({
  collection: "characters",
  readSchema: CharacterSchema,
  toCreateBody: toCharacterCreateBody,
  toUpdateBody: toCharacterUpdateBody,
  // `status` is already wire-identical, so the shared translator handles the
  // whole param set with no Character-specific casing.
  toListQuery: (params) => listParamsToQuery(params),
})
