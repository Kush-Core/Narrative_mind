import { factionDescriptor } from "@/features/factions/model/faction.descriptor"
import { EntityDetailPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Faction detail screen — the generic CRUD screen bound to the Faction
 * descriptor. See `CharacterDetailPage` for the shape all entity details share.
 *
 * Future expansion (a member roster once M5 lands relationships) attaches
 * through the descriptor's `detail` slot, not by rewriting this screen.
 */
export function FactionDetailPage() {
  return <EntityDetailPage descriptor={factionDescriptor} />
}
