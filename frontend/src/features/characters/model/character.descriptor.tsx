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
import type { EntityDescriptor } from "@/shared/entity-kit/types"
import { formatDateTime } from "@/shared/lib/date"

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
      {
        id: "name",
        header: "Name",
        sortable: true,
        cell: (character) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{character.name}</span>
            {character.aliases.length > 0 ? (
              <span className="text-2xs text-muted-foreground">
                {character.aliases[0]}
                {character.aliases.length > 1 ? ` +${character.aliases.length - 1}` : ""}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        sortable: true,
        cell: (character) => <CharacterStatusBadge status={character.status} />,
      },
      {
        id: "description",
        header: "Description",
        cell: (character) => (
          <span className="block max-w-md truncate text-muted-foreground">
            {character.description ?? "—"}
          </span>
        ),
      },
      {
        id: "created_at",
        header: "Created",
        sortable: true,
        cell: (character) => (
          <span className="text-muted-foreground">{formatDateTime(character.createdAt)}</span>
        ),
      },
    ],

    meta: [
      {
        id: "displayName",
        label: "Display name",
        value: (character) => character.displayName,
      },
      {
        id: "createdAt",
        label: "Created",
        value: (character) => formatDateTime(character.createdAt),
      },
      {
        id: "id",
        label: "Identifier",
        value: (character) => <code className="font-mono text-xs">{character.id}</code>,
      },
    ],

    sortableFields: CHARACTER_SORT_FIELDS,

    filter: {
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
      // fallback. The relationship editor joins this slot in M5.
      detail: (character) =>
        character.aliases.length > 0 ? <AliasList aliases={character.aliases} /> : null,
    },
  }
