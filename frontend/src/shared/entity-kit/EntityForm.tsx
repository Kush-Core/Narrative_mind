import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon } from "lucide-react"
import { useEffect } from "react"
import {
  Controller,
  type DefaultValues,
  type FieldValues,
  type Path,
  useForm,
  useWatch,
} from "react-hook-form"
import type { z } from "zod"

import { getFieldErrors } from "@/shared/api/error-presentation"
import type { EntityFieldSpec } from "@/shared/entity-kit/types"
import { cn } from "@/shared/lib/utils"
import type { UnknownRecord } from "@/shared/types/utility"
import { Button } from "@/shared/ui/button"
import { FormField } from "@/shared/ui/composite/FormField"
import { TagsInput } from "@/shared/ui/composite/TagsInput"
import { Input } from "@/shared/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select"
import { Textarea } from "@/shared/ui/textarea"

/**
 * One form for create *and* edit (docs/frontend/COMPONENT_HIERARCHY.md §5).
 *
 * The fields, their controls, and their bounds all come from the descriptor;
 * validation comes from the same Zod schema that validates API responses, so
 * the rules the user is held to and the rules the backend enforces cannot
 * drift (D7).
 *
 * Server-side field errors from a 422 are mapped back onto the offending
 * inputs rather than thrown at a toast — the user is looking at the field, so
 * that is where the message belongs.
 */

interface EntityFormProps<TForm extends FieldValues> {
  fields: EntityFieldSpec<TForm>[]
  /** The same schema that validates API responses — one rule set (D7). */
  schema: z.ZodType<TForm, TForm>
  defaultValues: TForm
  onSubmit: (values: TForm) => void | Promise<unknown>
  onCancel?: () => void
  submitLabel?: string
  /** A rejected submission; its `fieldErrors` are mapped onto the inputs. */
  error?: unknown
  isSubmitting?: boolean
  className?: string
}

export function EntityForm<TForm extends FieldValues>({
  fields,
  schema,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = "Save",
  error,
  isSubmitting = false,
  className,
}: EntityFormProps<TForm>) {
  const form = useForm<TForm>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as DefaultValues<TForm>,
    mode: "onBlur",
  })

  const { setError } = form

  // Map a server 422 onto the fields it names. Anything unrecognised is left
  // to the caller's own error surface rather than silently dropped.
  useEffect(() => {
    if (!error) return
    const fieldErrors = getFieldErrors(error)
    for (const [field, message] of Object.entries(fieldErrors)) {
      if (fields.some((spec) => spec.name === field)) {
        setError(field as Path<TForm>, { type: "server", message })
      }
    }
  }, [error, fields, setError])

  // Subscribe to values for the live character counters.
  const values = useWatch({ control: form.control })

  return (
    <form
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((data) => onSubmit(data))(event)
      }}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((spec) => {
          const fieldError = form.formState.errors[spec.name]
          const message = typeof fieldError?.message === "string" ? fieldError.message : undefined
          const currentValue = values[spec.name]

          return (
            <FormField
              key={spec.name}
              label={spec.label}
              error={message}
              description={spec.description}
              required={spec.required}
              hint={
                spec.maxLength && typeof currentValue === "string"
                  ? `${currentValue.length}/${spec.maxLength}`
                  : spec.maxItems && Array.isArray(currentValue)
                    ? `${currentValue.length}/${spec.maxItems}`
                    : undefined
              }
              action={spec.assist?.({
                value: currentValue,
                // `values` is React Hook Form's watched snapshot, typed as a
                // deep-partial of the form. An assist reads sibling fields by
                // name, so it is narrowed to `unknown` at this boundary rather
                // than leaking the form's shape into the assist contract.
                readField: (name) => (values as UnknownRecord)[name],
                apply: (value) =>
                  // `shouldDirty` matters: the update diff compares against the
                  // loaded entity, so a value written without it would be
                  // saved but reported as "No changes to save".
                  form.setValue(spec.name, value as never, { shouldDirty: true }),
                disabled: isSubmitting,
              })}
              className={cn(spec.span === "full" && "sm:col-span-2")}
            >
              {({ id, describedBy, invalid }) => {
                switch (spec.control) {
                  case "textarea":
                    return (
                      <Textarea
                        id={id}
                        rows={5}
                        placeholder={spec.placeholder}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        maxLength={spec.maxLength}
                        {...form.register(spec.name)}
                      />
                    )

                  case "select":
                    return (
                      <Controller
                        control={form.control}
                        name={spec.name}
                        render={({ field }) => (
                          <Select
                            value={typeof field.value === "string" ? field.value : undefined}
                            onValueChange={field.onChange}
                          >
                            <SelectTrigger
                              id={id}
                              className="w-full"
                              aria-invalid={invalid || undefined}
                              aria-describedby={describedBy}
                            >
                              <SelectValue placeholder={spec.placeholder} />
                            </SelectTrigger>
                            <SelectContent>
                              {spec.options?.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    )

                  case "tags":
                    return (
                      <Controller
                        control={form.control}
                        name={spec.name}
                        render={({ field }) => (
                          <TagsInput
                            id={id}
                            value={Array.isArray(field.value) ? (field.value as string[]) : []}
                            onChange={(next) => field.onChange(next)}
                            onBlur={field.onBlur}
                            maxTags={spec.maxItems}
                            placeholder={spec.placeholder}
                            invalid={invalid}
                            describedBy={describedBy}
                          />
                        )}
                      />
                    )

                  case "number":
                    return (
                      <Input
                        id={id}
                        type="number"
                        placeholder={spec.placeholder}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        {...form.register(spec.name, {
                          // Not `valueAsNumber`: that maps an emptied input to
                          // `NaN`, which fails validation with an unreadable
                          // message and — worse — is unequal to itself, so the
                          // update diff would see a change every time and send
                          // a `NaN` that serializes to `null` and is then
                          // silently dropped by `exclude_none`. Mapping blank to
                          // `undefined` lets the schema report it as the missing
                          // required value it is.
                          setValueAs: (value: unknown) =>
                            value === "" || value === null ? undefined : Number(value),
                        })}
                      />
                    )

                  default:
                    return (
                      <Input
                        id={id}
                        placeholder={spec.placeholder}
                        aria-invalid={invalid || undefined}
                        aria-describedby={describedBy}
                        maxLength={spec.maxLength}
                        {...form.register(spec.name)}
                      />
                    )
                }
              }}
            </FormField>
          )
        })}
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        {onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? <Loader2Icon className="animate-spin" aria-hidden /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

/** Values a form dialog hands back, kept as a named type for the callers. */
export type EntityFormValues<T> = T extends UnknownRecord ? T : never
