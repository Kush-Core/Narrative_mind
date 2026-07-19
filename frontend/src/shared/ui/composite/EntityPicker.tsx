import { useQuery } from "@tanstack/react-query"
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useState } from "react"

import type { EntityCollection } from "@/shared/api/endpoints"
import { ENTITY_LOOKUP_LIMIT, lookupEntities, lookupEntity } from "@/shared/api/entity-lookup"
import { type EntityKind, entityKindIdentity } from "@/shared/domain/entity-kinds"
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/shared/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/shared/ui/popover"

/**
 * Search-select over any entity collection
 * (docs/frontend/COMPONENT_HIERARCHY.md §4).
 *
 * Entity-agnostic by construction: it takes an `EntityKind`, resolves that
 * kind's collection and identity from the shared registry, and searches through
 * `lookupEntities`. It imports no feature slice, which is what lets both the
 * graph workspace and the relationship dialog use it without either depending on
 * the other (see `shared/api/entity-lookup.ts` for why that matters).
 *
 * This is the component the promotion rule was waiting on. `GraphSourcePicker`
 * was the first consumer and stayed feature-local by design; the relationship
 * dialog is the second, and their shared shape is exactly this.
 */

interface EntityPickerProps {
  /** Which kind to search. Determines the collection, icon, and accent. */
  kind: EntityKind
  value: string | undefined
  onChange: (id: string, name: string) => void
  /** Shown on the trigger before anything is chosen. */
  placeholder?: string
  /**
   * Resolved name for `value`, when the caller already knows it. Without this,
   * a preselected id shows as a placeholder until its page happens to load.
   */
  valueLabel?: string
  /** Ids to hide — used to keep an entity from being related to itself. */
  excludeIds?: readonly string[]
  disabled?: boolean
  /**
   * Adopted from `FormField`, which renders a `<Label htmlFor>` pointing at it.
   * That is what gives the trigger its accessible name — so it must not also
   * carry an `aria-labelledby`, which would override the label with whatever it
   * pointed at.
   */
  id?: string
  "aria-describedby"?: string
  invalid?: boolean
  className?: string
}

export function EntityPicker({
  kind,
  value,
  onChange,
  placeholder,
  valueLabel,
  excludeIds,
  disabled,
  id,
  "aria-describedby": ariaDescribedBy,
  invalid,
  className,
}: EntityPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)

  const identity = entityKindIdentity(kind)
  // Every real entity kind maps to a collection; `Unknown` is not offered here.
  const collection = identity.collection as EntityCollection

  const query = useQuery({
    queryKey: ["entity-lookup", collection, debouncedSearch.trim(), ENTITY_LOOKUP_LIMIT],
    queryFn: ({ signal }) => lookupEntities(collection, { search: debouncedSearch, signal }),
    // Only fetch while open — a dialog should not pay for lists it never shows.
    enabled: open,
    placeholderData: (previous) => previous,
  })

  const options = (query.data ?? []).filter((option) => !excludeIds?.includes(option.id))
  const selected = options.find((option) => option.id === value)
  const noun = identity.singular.toLowerCase()

  /**
   * Resolve a preselected id to its name.
   *
   * Needed because the list only loads while the popover is open, so a value
   * arriving from the URL or a prefilled form has no name to show until the
   * user opens the picker — which read "Selected character" on the graph
   * workspace for a character whose name was one request away. Skipped entirely
   * when the caller already knows the name or the list happens to contain it.
   */
  const needsResolution = Boolean(value) && !valueLabel && !selected
  const resolved = useQuery({
    queryKey: ["entity-lookup", "one", collection, value],
    queryFn: ({ signal }) => lookupEntity(collection, value ?? "", signal),
    enabled: needsResolution,
    staleTime: 60_000,
  })

  // The caller's label wins: it survives a search that filters the selected
  // entity out of the current page.
  const triggerLabel =
    valueLabel ??
    selected?.name ??
    resolved.data?.name ??
    (value ? `Selected ${noun}` : (placeholder ?? `Choose a ${noun}…`))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-describedby={ariaDescribedBy}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <identity.icon
              className={cn("size-3.5 shrink-0", identity.accentClassName)}
              aria-hidden
            />
            <span className={cn("truncate", !value && "text-muted-foreground")}>
              {triggerLabel}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
        // The dialog traps focus; without this the popover's own content is
        // unreachable when the picker is used inside one.
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {/* Filtering is server-side via `name_contains`, so cmdk's own client
            filter is disabled — otherwise it would filter the filtered page. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={`Search ${identity.plural.toLowerCase()}…`}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {query.isPending ? (
              <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            ) : query.isError ? (
              <div className="p-3 text-xs text-destructive">
                Could not load {identity.plural.toLowerCase()}.
              </div>
            ) : (
              <>
                <CommandEmpty>No {identity.plural.toLowerCase()} found.</CommandEmpty>
                <CommandGroup>
                  {options.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      onSelect={() => {
                        onChange(option.id, option.name)
                        setOpen(false)
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          "size-3.5",
                          option.id === value ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{option.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
