import type { FieldValues } from "react-hook-form"

import { EntityForm } from "@/shared/entity-kit/EntityForm"
import type { BaseListParams, EntityDescriptor } from "@/shared/entity-kit/types"
import { useEntityMutations } from "@/shared/entity-kit/useEntityMutations"
import type { Identifiable, UnknownRecord } from "@/shared/types/utility"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"

/**
 * Create and edit in one component — the requirement that editing reuse the
 * creation form, made structural rather than a convention someone must follow.
 *
 * The only difference between the two modes is the seed values and which
 * mutation runs; the fields, validation, layout, and error mapping are shared
 * by construction. `mode` is derived from whether an entity was supplied, so
 * the two can never disagree.
 *
 * Remounting the form on each open (via `key`) resets it to the right values —
 * a dialog reopened on a different entity must not show the previous one's
 * edits.
 */

interface EntityFormDialogProps<
  TRead extends Identifiable,
  TForm extends FieldValues & UnknownRecord,
  TListParams extends BaseListParams,
> {
  descriptor: EntityDescriptor<TRead, TForm, TListParams>
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Absent → create; present → edit that entity. */
  entity?: TRead
  /** Called with the created entity, for navigation after a create. */
  onCreated?: (entity: TRead) => void
}

export function EntityFormDialog<
  TRead extends Identifiable,
  TForm extends FieldValues & UnknownRecord,
  TListParams extends BaseListParams,
>({
  descriptor,
  open,
  onOpenChange,
  entity,
  onCreated,
}: EntityFormDialogProps<TRead, TForm, TListParams>) {
  const { create, update } = useEntityMutations(descriptor)

  const isEdit = entity !== undefined
  const defaultValues = isEdit ? descriptor.toForm(entity) : descriptor.emptyForm
  const mutation = isEdit ? update : create
  const noun = descriptor.singular.toLowerCase()

  function handleSubmit(values: TForm) {
    if (isEdit) {
      update.mutate(
        { id: entity.id, original: descriptor.toForm(entity), values },
        { onSuccess: () => onOpenChange(false) },
      )
      return
    }

    create.mutate(values, {
      onSuccess: (created) => {
        onOpenChange(false)
        onCreated?.(created)
      },
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Edit ${noun}` : `New ${noun}`}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? `Update this ${noun}. Only the fields you change are sent.`
              : `Add a new ${noun} to your world.`}
          </DialogDescription>
        </DialogHeader>

        <EntityForm<TForm>
          key={entity?.id ?? "create"}
          fields={descriptor.fields}
          schema={descriptor.formSchema}
          defaultValues={defaultValues}
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          submitLabel={isEdit ? "Save changes" : `Create ${noun}`}
          error={mutation.error}
          isSubmitting={mutation.isPending}
        />
      </DialogContent>
    </Dialog>
  )
}
