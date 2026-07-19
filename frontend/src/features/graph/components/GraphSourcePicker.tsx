import { EntityPicker } from "@/shared/ui/composite/EntityPicker"

/**
 * Chooses which character's network to explore.
 *
 * The backend roots ego networks at a Character
 * (`GET /graph/characters/{id}/network`), so the graph always needs one, and
 * picking it is the workspace's entry point.
 *
 * **This is now a thin binding over `EntityPicker`.** It previously held its own
 * popover, search, debounce, and query — and reached into the characters slice
 * for `characterDescriptor.resource` to do it. The note it carried said it would
 * stay feature-local "until the relationship editor lands and shows what a
 * general `EntityPicker` really needs". That has happened: the two wanted the
 * same component, and the shared one searches by kind through
 * `shared/api/entity-lookup.ts` rather than through a descriptor — so the graph
 * no longer depends on the characters slice at all.
 *
 * What remains here is the one graph-specific fact: the source is always a
 * Character.
 */

interface GraphSourcePickerProps {
  characterId: string | undefined
  onSelect: (characterId: string) => void
}

export function GraphSourcePicker({ characterId, onSelect }: GraphSourcePickerProps) {
  return (
    <EntityPicker
      kind="Character"
      value={characterId}
      onChange={(id) => onSelect(id)}
      placeholder="Choose a character…"
      className="w-56"
    />
  )
}
