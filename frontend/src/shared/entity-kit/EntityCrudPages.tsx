import { useState } from "react"
import type { FieldValues } from "react-hook-form"
import { useNavigate, useParams } from "react-router-dom"

import { EntityDetailView } from "@/shared/entity-kit/EntityDetailView"
import { EntityFormDialog } from "@/shared/entity-kit/EntityFormDialog"
import { EntityListView } from "@/shared/entity-kit/EntityListView"
import { ENTITY_ID_PARAM } from "@/shared/entity-kit/route-params"
import type { BaseListParams, EntityDescriptor } from "@/shared/entity-kit/types"
import { useEntityMutations } from "@/shared/entity-kit/useEntityMutations"
import type { Identifiable, UnknownRecord } from "@/shared/types/utility"
import { ConfirmDialog } from "@/shared/ui/composite/ConfirmDialog"

/**
 * The two complete CRUD screens, generic over the descriptor
 * (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * `EntityListView` and `EntityDetailView` render an entity; these own the
 * *screen* around it — the create/edit dialog state, the delete confirmation,
 * and the navigation decisions that follow a write. Those were the last pieces
 * each feature still wrote by hand, and by M4 the Character and Location
 * versions had become byte-identical apart from the entity's name. Duplication
 * that exact is a missing abstraction, so it lives here once.
 *
 * Feature slices still export their own thin `<Entity>ListPage` /
 * `<Entity>DetailPage`: the public surface and the route wiring are unchanged,
 * and a slice that later needs page-level behaviour the generic screen cannot
 * express can stop delegating without disturbing anything else.
 */

interface EntityRouteParams extends Record<string, string | undefined> {
  [ENTITY_ID_PARAM]: string
}

interface EntityPageProps<
  TRead extends Identifiable,
  TForm extends FieldValues & UnknownRecord,
  TListParams extends BaseListParams,
> {
  descriptor: EntityDescriptor<TRead, TForm, TListParams>
}

/**
 * The list screen: the table plus the create flow.
 *
 * A newly created entity navigates straight to its detail screen — creating one
 * is almost always the prelude to writing about it.
 */
export function EntityListPage<
  TRead extends Identifiable,
  TForm extends FieldValues & UnknownRecord,
  TListParams extends BaseListParams,
>({ descriptor }: EntityPageProps<TRead, TForm, TListParams>) {
  const navigate = useNavigate()
  const [isCreateOpen, setCreateOpen] = useState(false)

  return (
    <>
      <EntityListView descriptor={descriptor} onCreate={() => setCreateOpen(true)} />

      <EntityFormDialog
        descriptor={descriptor}
        open={isCreateOpen}
        onOpenChange={setCreateOpen}
        onCreated={(created) => void navigate(descriptor.routes.detail(created.id))}
      />
    </>
  )
}

/**
 * The detail screen: the record plus the edit and delete flows.
 *
 * Deleting returns to the list, because the screen the user is standing on no
 * longer describes anything. On failure the confirmation stays open with the
 * error toasted, so the user can retry or cancel rather than losing the context.
 */
export function EntityDetailPage<
  TRead extends Identifiable,
  TForm extends FieldValues & UnknownRecord,
  TListParams extends BaseListParams,
>({ descriptor }: EntityPageProps<TRead, TForm, TListParams>) {
  const params = useParams<EntityRouteParams>()
  const id = params[ENTITY_ID_PARAM]
  const navigate = useNavigate()

  const [editing, setEditing] = useState<TRead | undefined>(undefined)
  const [pendingDelete, setPendingDelete] = useState<TRead | undefined>(undefined)
  const { remove } = useEntityMutations(descriptor)

  const noun = descriptor.singular.toLowerCase()

  if (!id) return null

  function handleConfirmDelete() {
    if (!pendingDelete) return
    remove.mutate(pendingDelete.id, {
      onSuccess: () => {
        setPendingDelete(undefined)
        void navigate(descriptor.routes.list())
      },
    })
  }

  return (
    <>
      <EntityDetailView
        descriptor={descriptor}
        id={id}
        onEdit={setEditing}
        onDelete={setPendingDelete}
      />

      <EntityFormDialog
        descriptor={descriptor}
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        entity={editing}
      />

      <ConfirmDialog
        open={pendingDelete !== undefined}
        onOpenChange={(open) => !open && setPendingDelete(undefined)}
        title={`Delete ${pendingDelete ? descriptor.getTitle(pendingDelete) : noun}?`}
        description={`This permanently removes the ${noun} and every relationship connected to it. This cannot be undone.`}
        confirmLabel="Delete"
        pending={remove.isPending}
        onConfirm={handleConfirmDelete}
      />
    </>
  )
}
