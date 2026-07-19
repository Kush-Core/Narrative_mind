import { zodResolver } from "@hookform/resolvers/zod"
import { ArrowRightIcon, Loader2Icon } from "lucide-react"
import { useState } from "react"
import { Controller, useForm, useWatch } from "react-hook-form"

import { isApiError } from "@/shared/api/api-error"
import { toUserMessage } from "@/shared/api/error-presentation"
import { type EntityKind, entityKindIdentity } from "@/shared/domain/entity-kinds"
import {
  type RelationshipEndpoints,
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
 * So the dialog takes the **endpoints that are already fixed** rather than "the
 * entity it was opened from" (`shared/domain/relationships.ts`). Every surface
 * expresses itself in those terms and none of them has to know about the others:
 *
 *  - An entity detail screen fixes one end — the source from a Character, the
 *    target from anything else — via `endpointsForEntity`.
 *  - The graph's connect flow fixes **both**, having resolved which node can be
 *    the source via `resolveRelationshipEndpoints`.
 *  - With nothing fixed, both ends are pickable.
 *
 * All three land in the same form, the same validation, and the same mutation.
 * That is what stops the graph growing a second relationship implementation.
 */

interface RelationshipDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Ends that are already decided. Whatever is absent is picked in the dialog.
   */
  endpoints?: RelationshipEndpoints
  onCreated?: () => void
}

export function RelationshipDialog({
  open,
  onOpenChange,
  endpoints,
  onCreated,
}: RelationshipDialogProps) {
  // Remounting on each open is what resets the form; the inner component holds
  // all the state, so there is nothing to clear by hand.
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {open ? (
          <RelationshipDialogBody
            endpoints={endpoints}
            onClose={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function RelationshipDialogBody({
  endpoints,
  onClose,
  onCreated,
}: {
  endpoints?: RelationshipEndpoints
  onClose: () => void
  onCreated?: () => void
}) {
  const { types } = useRelationshipTypes(endpoints)
  const mutation = useCreateRelationship()

  const fixedSource = endpoints?.source
  const fixedTarget = endpoints?.target

  const form = useForm<RelationshipForm>({
    resolver: zodResolver(RelationshipFormSchema),
    mode: "onBlur",
    defaultValues: {
      sourceId: fixedSource?.id ?? "",
      // With one type available the choice is not a choice, so it is made.
      relType: (types.length === 1 ? types[0]?.type : undefined) as RelationshipType,
      targetId: fixedTarget?.id ?? "",
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
  const targetKind: EntityKind = fixedTarget?.kind ?? definition?.targetKind ?? "Character"

  // Names are tracked alongside the ids because the review line and the success
  // toast both need them, and the pickers already have them — resolving an id
  // back to a name would be a request for a label we were just handed.
  const [sourceName, setSourceName] = useState(fixedSource?.name)
  const [targetName, setTargetName] = useState(fixedTarget?.name)

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
    if (fixedTarget) return
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
        <DialogDescription>{describeIntent(endpoints)}</DialogDescription>
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
            fixedSource
              ? undefined
              : "Relationships are recorded from a character outward, so the connection starts here."
          }
        >
          {({ id, describedBy, invalid }) =>
            fixedSource ? (
              <PinnedEntity kind={fixedSource.kind} name={fixedSource.name} />
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
          description={!relType && !fixedTarget ? "Choose a relationship type first." : undefined}
        >
          {({ id, describedBy, invalid }) =>
            fixedTarget ? (
              <PinnedEntity kind={fixedTarget.kind} name={fixedTarget.name} />
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

/**
 * What the writer is here to do, phrased from what is already decided.
 *
 * Both ends fixed means the graph sent them here with only the type left to
 * choose, and saying so is more useful than repeating the names they can read
 * in the fields below.
 */
function describeIntent(endpoints: RelationshipEndpoints | undefined): string {
  const { source, target } = endpoints ?? {}

  if (source && target) return "Choose how these two are connected."
  if (source) return `Connect ${source.name} to another part of your world.`
  if (target) return `Record which characters connect to ${target.name}.`
  return "Connect two entities in your world."
}
