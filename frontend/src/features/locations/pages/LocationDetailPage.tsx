import { locationDescriptor } from "@/features/locations/model/location.descriptor"
import { EntityDetailPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Location detail screen — the generic CRUD screen bound to the Location
 * descriptor. See `CharacterDetailPage` for the shape all entity details share.
 */
export function LocationDetailPage() {
  return <EntityDetailPage descriptor={locationDescriptor} />
}
