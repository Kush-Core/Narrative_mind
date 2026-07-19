import { eventDescriptor } from "@/features/events/model/event.descriptor"
import { EntityDetailPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Event detail screen — the generic CRUD screen bound to the Event
 * descriptor. See `CharacterDetailPage` for the shape all entity details share.
 *
 * Narrative expansion (participants, locations, factions, AI annotations)
 * attaches through the descriptor's `detail` slot, not by rewriting this file.
 */
export function EventDetailPage() {
  return <EntityDetailPage descriptor={eventDescriptor} />
}
