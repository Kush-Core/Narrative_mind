import { UsersIcon } from "lucide-react"

import { charactersApi } from "@/features/characters/api/characters.api"
import { AliasList } from "@/features/characters/components/AliasList"
import { CharacterStatusBadge } from "@/features/characters/components/CharacterStatusBadge"
import {
  type Character,
  CHARACTER_SORT_FIELDS,
  CHARACTER_STATUS_OPTIONS,
  type CharacterForm,
  CharacterFormSchema,
  type CharacterListParams,
  CharacterListParamsSchema,
  EMPTY_CHARACTER_FORM,
  toCharacterForm,
} from "@/features/characters/model/character.schema"
import { paths } from "@/routes/paths"
import { entityKeys } from "@/shared/api/query-keys"
import {
  createdAtColumn,
  createdAtMeta,
  identifierMeta,
  nameColumn,
  truncatedTextColumn,
} from "@/shared/entity-kit/columns"
import type { EntityDescriptor } from "@/shared/entity-kit/types"
import { RelationshipsSection } from "@/shared/relationships"

/**
 * Everything specific about Characters, in one declaration.
 *
 * The generic list, detail, and form screens are driven entirely by this
 * object — there is no Character-aware code inside `entity-kit/`. Adding
 * Locations means writing one of these, not another set of screens.
 *
 * A `.tsx` file because columns and meta rows render JSX; it holds no
 * behaviour of its own.
 */
export const characterDescriptor: EntityDescriptor<Character, CharacterForm, CharacterListParams> =
  {
    collection: "characters",
    singular: "Character",
    plural: "Characters",
    icon: UsersIcon,
    accentClassName: "text-entity-character",

    routes: {
      list: () => paths.characters.list(),
      detail: (id) => paths.characters.detail(id),
    },

    resource: charactersApi,
    keys: entityKeys("characters"),

    listParamsSchema: CharacterListParamsSchema,
    formSchema: CharacterFormSchema,
    emptyForm: EMPTY_CHARACTER_FORM,
    toForm: toCharacterForm,

    fields: [
      {
        name: "name",
        label: "Name",
        control: "text",
        placeholder: "Aria Vane",
        required: true,
        maxLength: 120,
      },
      {
        name: "status",
        label: "Status",
        control: "select",
        options: CHARACTER_STATUS_OPTIONS,
        required: true,
      },
      {
        name: "aliases",
        label: "Aliases",
        control: "tags",
        placeholder: "Add an alias and press Enter",
        description: "Other names this character is known by. Duplicates are ignored.",
        maxItems: 10,
        span: "full",
      },
      {
        name: "description",
        label: "Description",
        control: "textarea",
        placeholder: "Who they are, what drives them, how they carry themselves…",
        maxLength: 2000,
        span: "full",
      },
    ],

    // Column ids that are sortable must match the backend's whitelist exactly,
    // or the sort would be silently ignored server-side.
    columns: [
      nameColumn({
        get: (character) => character.name,
        // Aliases are identity for a character, so the primary one earns a place
        // in the list — the escape hatch the shared builder leaves open.
        secondary: (character) =>
          character.aliases.length > 0
            ? `${character.aliases[0]}${
                character.aliases.length > 1 ? ` +${character.aliases.length - 1}` : ""
              }`
            : null,
      }),
      {
        id: "status",
        header: "Status",
        sortable: true,
        cell: (character) => <CharacterStatusBadge status={character.status} />,
      },
      truncatedTextColumn({
        id: "description",
        header: "Description",
        get: (character) => character.description,
      }),
      createdAtColumn((character) => character.createdAt),
    ],

    meta: [
      {
        id: "displayName",
        label: "Display name",
        value: (character) => character.displayName,
      },
      createdAtMeta((character) => character.createdAt),
      identifierMeta(),
    ],

    sortableFields: CHARACTER_SORT_FIELDS,

    filter: {
      // A closed enum, so the writer picks from a list rather than typing.
      kind: "select",
      name: "status",
      label: "Filter by status",
      options: CHARACTER_STATUS_OPTIONS,
      allLabel: "All statuses",
    },

    getTitle: (character) => character.name,
    getSubtitle: (character) =>
      character.aliases.length > 0 ? `Also known as ${character.aliases.join(", ")}` : undefined,

    emptyState: {
      title: "No characters yet",
      description: "Characters are the people of your world. Create the first one to begin.",
    },

    slots: {
      // Aliases deserve richer presentation than the generic comma-joined
      // fallback; relationships are the other thing a character *is* beyond its
      // own fields. Both enter through the slot, so `EntityDetailView` still
      // contains no per-entity branch.
      detail: (character) => (
        <>
          {character.aliases.length > 0 ? <AliasList aliases={character.aliases} /> : null}
          <RelationshipsSection kind="Character" id={character.id} name={character.name} />
        </>
      ),
    },
  }
