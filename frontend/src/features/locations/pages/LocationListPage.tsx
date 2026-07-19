import { locationDescriptor } from "@/features/locations/model/location.descriptor"
import { EntityListPage } from "@/shared/entity-kit/EntityCrudPages"

/**
 * The Location list screen — the generic CRUD screen bound to the Location
 * descriptor. See `CharacterListPage` for the shape all entity lists share.
 */
export function LocationListPage() {
  return <EntityListPage descriptor={locationDescriptor} />
}
