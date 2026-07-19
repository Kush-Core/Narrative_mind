import { useState } from "react"
import { useNavigate } from "react-router-dom"

import { locationDescriptor } from "@/features/locations/model/location.descriptor"
import type { Location } from "@/features/locations/model/location.schema"
import { EntityFormDialog } from "@/shared/entity-kit/EntityFormDialog"
import { EntityListView } from "@/shared/entity-kit/EntityListView"

/**
 * The Location list screen — the Character list with one word changed.
 *
 * That is the point: URL-driven search, region filtering, sorting, pagination,
 * and the empty/loading/error states all come from `EntityListView` reading the
 * descriptor. This page owns only the create-dialog state and where a new
 * location sends the user.
 */
export function LocationListPage() {
  const navigate = useNavigate()
  const [isCreateOpen, setCreateOpen] = useState(false)

  return (
    <>
      <EntityListView descriptor={locationDescriptor} onCreate={() => setCreateOpen(true)} />

      <EntityFormDialog
        descriptor={locationDescriptor}
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        // Land on the new location: creating one is almost always the prelude
        // to describing it.
        onCreated={(location: Location) =>
          void navigate(locationDescriptor.routes.detail(location.id))
        }
      />
    </>
  )
}
