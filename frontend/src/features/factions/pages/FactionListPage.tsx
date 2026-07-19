import { factionDescriptor } from "@/features/factions/model/faction.descriptor"
import { EntityListPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Faction list screen — the generic CRUD screen bound to the Faction
 * descriptor. See `CharacterListPage` for the shape all entity lists share.
 */
export function FactionListPage() {
  return <EntityListPage descriptor={factionDescriptor} />
}
