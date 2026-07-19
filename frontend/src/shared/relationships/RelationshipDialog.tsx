import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { isApiError } from "@/shared/api/api-error"
import { toUserMessage } from "@/shared/api/error-presentation"
import { type EntityKind, entityKindIdentity } from "@/shared/domain/entity-kinds"
import {
  type RelationshipAnchor,
  type RelationshipType,
  relationshipTypeDefinition,
} from "@/shared/domain/relationships"
import { cn } from "@/shared/lib/utils"
import {
  type RelationshipForm,
  RelationshipFormSchema,
  SENTIMENT_MAX_LENGTH,
} from "@/shared/relationships/relationship.schema"
import { useCreateRelationship } from "@/shared/relationships/useCreateRelationship"
import { useRelationshipTypes } from "@/shared/relationships/useRelationshipTypes"
import { Button } from "@/shared/ui/button"
import { EntityPicker } from "@/shared/ui/composite/EntityPicker"
import { FormField } from "@/shared/ui/composite/FormField"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"

/**
 * Create a relationship between two entities.
 *
 * **Generic by construction.** It knows about `EntityKind` and the relationship
 * catalog, both of which live in `shared/domain/`, and about the `EntityPicker`,
 * which searches any collection. It imports no feature slice, so Character,
 * Location, Faction, and Event all open the same component — and a fifth entity
 * type would too, without touching this file.
 *
 * ---------------------------------------------------------------------------
 * Why the pinned entity is not always the source
 * ---------------------------------------------------------------------------
 *
 * The backend's Cypher is `MATCH (source:Character {id: $source_id})`, so only a
 * Character can be a relationship's source. Opening this dialog from a Faction
 * page therefore *cannot* mean "this faction relates to something" — the only
 * expressible statement is "some character is a member of this faction".
 *
 * So the anchor carries a role (`shared/domain/relationships.ts`): from a
 * Character it pins the source and the writer picks the target; from anything
 * else it pins the target and the writer picks the character. Either way exactly
 * one end is prefilled and the writer fills the other, which is what the feature
 * asks for — the direction just follows the data model rather than the screen
 * the user happens to be standing on.
 *
 * With no anchor at all, both ends are pickable. Nothing wires that up today; it
 * is what a future graph-side entry point would use.
 */

interface RelationshipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The entity this was opened from, and which end it occupies. */
  anchor?: RelationshipAnchor
  onCreated?: () => void
}

export function RelationshipDialog({
  open,
  onOpenChange,
  anchor,
  onCreated,
}: RelationshipDialogProps) {
  // Remounting on each open is what resets the form; the inner component holds
  // all the state, so there is nothing to clear by hand.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? (
          <RelationshipDialogBody
            anchor={anchor}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RelationshipDialogBody({
  anchor,
  onClose,
  onCreated,
}: {
  anchor?: RelationshipAnchor
  onClose: () => void
  onCreated?: () => void
}) {
  const { types } = useRelationshipTypes(anchor)
  const mutation = useCreateRelationship()

  const anchoredSource = anchor?.role === "source" ? anchor : undefined
  const anchoredTarget = anchor?.role === "target" ? anchor : undefined

  const form = useForm<RelationshipForm>({
    resolver: zodResolver(RelationshipFormSchema),
    mode: "onBlur",
    defaultValues: {
      sourceId: anchoredSource?.id ?? "",
      // With one type available the choice is not a choice, so it is made.
      relType: (types.length === 1 ? types[0]?.type : undefined) as RelationshipType,
      targetId: anchoredTarget?.id ?? "",
      sentiment: "",
    },
  })

  const { control, handleSubmit, setValue, formState } = form

  // `useWatch` rather than `form.watch`: the latter returns a value the React
  // Compiler cannot memoize safely, and `EntityForm` already set this precedent.
  const relType = useWatch({ control, name: "relType" })
  const sourceId = useWatch({ control, name: "sourceId" })
  const targetId = useWatch({ control, name: "targetId" })

  const definition = relType ? relationshipTypeDefinition(relType) : undefined
  // The chosen type decides which collection the target picker searches, which
  // is how the UI guides valid pairings without enforcing a rule the backend
  // does not (see `shared/domain/relationships.ts`).
  const targetKind: EntityKind = anchoredTarget?.kind ?? definition?.targetKind ?? "Character"

  // Names are tracked alongside the ids because the review line and the success
  // toast both need them, and the pickers already have them — resolving an id
  // back to a name would be a request for a label we were just handed.
  const [sourceName, setSourceName] = useState(anchoredSource?.name)
  const [targetName, setTargetName] = useState(anchoredTarget?.name)

  /**
   * Changing the type changes what a valid target *is*, so a target chosen
   * under the previous type must not silently survive into the new one —
   * picking `MEMBER_OF` then switching to `LOCATED_IN` would otherwise submit a
   * faction as a location.
   *
   * Done here rather than in an effect watching `relType`: this is a reaction to
   * an event, not state that needs synchronising, and a `setState` inside an
   * effect would cascade an extra render on every change.
   */
  function handleTypeChange(next: string, onChange: (value: string) => void) {
    onChange(next)
    if (anchoredTarget) return
    setValue("targetId", "", { shouldValidate: false })
    setTargetName(undefined)
  }

  const isSelfRelationship = sourceId !== "" && sourceId === targetId
  const canSubmit = sourceId !== "" && targetId !== "" && Boolean(relType) && !isSelfRelationship

  function onSubmit(values: RelationshipForm) {
    if (isSelfRelationship) return

    mutation.mutate(
      {
        form: {
          ...values,
          // Sentiment describes a stance one character holds toward another, so
          // it is dropped rather than stored where nothing will ever read it.
          sentiment: definition?.supportsSentiment ? values.sentiment : undefined,
        },
        sourceName: sourceName ?? "Character",
        targetName: targetName ?? entityKindIdentity(targetKind).singular,
      },
      {
        onSuccess: () => {
          onClose()
          onCreated?.()
        },
      },
    )
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>New relationship</DialogTitle>
        <DialogDescription>
          {anchor
            ? `Connect ${anchor.name} to another part of your world.`
            : "Connect two entities in your world."}
        </DialogDescription>
      </DialogHeader>

      <form
        onSubmit={(event) => void handleSubmit(onSubmit)(event)}
        className="flex flex-col gap-4"
      >
        {/* Source. Pinned from a Character page, chosen otherwise — and always
            a Character, because the backend accepts no other source. */}
        <FormField
          label="From"
          required
          error={formState.errors.sourceId?.message}
          description={
            anchoredSource
              ? undefined
              : "Relationships are recorded from a character outward, so the connection starts here."
          }
        >
          {({ id, describedBy, invalid }) =>
            anchoredSource ? (
              <PinnedEntity kind={anchoredSource.kind} name={anchoredSource.name} />
            ) : (
              <Controller
                control={control}
                name="sourceId"
                render={({ field }) => (
                  <EntityPicker
                    id={id}
                    kind="Character"
                    value={field.value || undefined}
                    valueLabel={sourceName}
                    excludeIds={targetId ? [targetId] : undefined}
                    onChange={(value, name) => {
                      field.onChange(value)
                      setSourceName(name)
                    }}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              />
            )
          }
        </FormField>

        <FormField
          label="Relationship"
          required
          error={formState.errors.relType?.message}
          description={definition?.description}
        >
          {({ id }) => (
            <Controller
              control={control}
              name="relType"
              render={({ field }) => (
                <Select
                  value={field.value ?? ""}
                  onValueChange={(next) => handleTypeChange(next, field.onChange)}
                  // A pinned target of a given kind admits exactly one type, so
                  // there is nothing to choose.
                  disabled={types.length <= 1}
                >
                  <SelectTrigger id={id} className="w-full">
                    <SelectValue placeholder="Choose a relationship type…" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((option) => (
                      <SelectItem key={option.type} value={option.type}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          )}
        </FormField>

        <FormField
          label="To"
          required
          error={
            isSelfRelationship
              ? "An entity cannot be related to itself."
              : formState.errors.targetId?.message
          }
          description={
            !relType && !anchoredTarget ? "Choose a relationship type first." : undefined
          }
        >
          {({ id, describedBy, invalid }) =>
            anchoredTarget ? (
              <PinnedEntity kind={anchoredTarget.kind} name={anchoredTarget.name} />
            ) : (
              <Controller
                control={control}
                name="targetId"
                render={({ field }) => (
                  <EntityPicker
                    id={id}
                    kind={targetKind}
                    value={field.value || undefined}
                    valueLabel={targetName}
                    // Prevents the self-relationship rather than only reporting
                    // it: the invalid choice is never offered.
                    excludeIds={sourceId ? [sourceId] : undefined}
                    disabled={!relType}
                    onChange={(value, name) => {
                      field.onChange(value)
                      setTargetName(name)
                    }}
                    aria-describedby={describedBy}
                    invalid={invalid}
                  />
                )}
              />
            )
          }
        </FormField>

        {/* Only `KNOWS` describes a stance, so the field appears only there
            rather than being shown and ignored. */}
        {definition?.supportsSentiment ? (
          <FormField
            label="Sentiment"
            error={formState.errors.sentiment?.message}
            description="How this character regards the other — “loyal”, “estranged”, “wary”."
          >
            {({ id, describedBy }) => (
              <Input
                id={id}
                aria-describedby={describedBy}
                maxLength={SENTIMENT_MAX_LENGTH}
                placeholder="Optional"
                {...form.register("sentiment")}
              />
            )}
          </FormField>
        ) : null}

        <RelationshipPreview
          sourceName={sourceName}
          targetName={targetName}
          phrase={definition?.phrase}
        />

        {/* A failed write, in the dialog that caused it. `not_found` is the one
            worth rewording: the backend's "Target with id … not found" names an
            id the writer never typed. */}
        {mutation.isError ? (
          <p role="alert" className="text-xs text-destructive">
            {mutation.error && isNotFound(mutation.error)
              ? "One of these entities no longer exists. It may have been deleted in another view."
              : toUserMessage(mutation.error)}
          </p>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
            Create relationship
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

/** An end of the relationship that was fixed by where the dialog was opened. */
function PinnedEntity({ kind, name }: { kind: EntityKind; name: string }) {
  const identity = entityKindIdentity(kind)

  return (
    <div className="flex h-8 items-center gap-1.5 rounded-md border bg-muted/40 px-2.5 text-sm">
      <identity.icon className={cn("size-3.5 shrink-0", identity.accentClassName)} aria-hidden />
      <span className="truncate">{name}</span>
    </div>
  )
}

/**
 * The review step.
 *
 * Rendered continuously rather than as a separate wizard page: the relationship
 * is one sentence, and a writer who can read it forming as they choose does not
 * need a confirmation screen to check it. Placeholders keep the line's shape
 * stable so it does not jump as parts arrive.
 */
function RelationshipPreview({
  sourceName,
  targetName,
  phrase,
}: {
  sourceName?: string
  targetName?: string
  phrase?: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-dashed px-3 py-2.5 text-sm">
      <Part value={sourceName} placeholder="Character" />
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {phrase ?? "relates to"}
        <ArrowRightIcon className="size-3" aria-hidden />
      </span>
      <Part value={targetName} placeholder="Entity" />
    </div>
  )
}

function Part({ value, placeholder }: { value?: string; placeholder: string }) {
  return value ? (
    <span className="font-medium">{value}</span>
  ) : (
    <span className="text-muted-foreground italic">{placeholder}</span>
  )
}

function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.isNotFound
}
