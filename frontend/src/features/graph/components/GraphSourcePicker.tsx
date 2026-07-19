import { useQuery } from "@tanstack/react-query"
import { CheckIcon, ChevronsUpDownIcon, UsersIcon } from "lucide-react"
import { useState } from "react"

import { characterDescriptor } from "@/features/characters"
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
 * Chooses which character's network to explore.
 *
 * The backend roots ego networks at a Character
 * (`GET /graph/characters/{id}/network`), so the graph always needs one, and
 * picking it is the workspace's entry point.
 *
 * **On the cross-feature dependency.** This reaches into the characters slice
 * through its public `index.ts` only — `characterDescriptor.resource` and
 * `.listParamsSchema` — which is exactly what
 * docs/frontend/FRONTEND_FILE_STRUCTURE.md §3.3 permits ("never on another
 * feature's internals, only its public surface"). The alternative, re-declaring
 * the character list contract inside the graph, would duplicate a schema the app
 * already owns.
 *
 * **On not promoting this to `shared/`.** It is the second thing that will want
 * to pick an entity — the relationship editor is the other — but it is the
 * *first* to actually exist. The promotion rule is "on the second real
 * consumer", so it stays local until the relationship editor lands and shows
 * what a general `EntityPicker` really needs.
 */

/** Enough to browse comfortably; the search narrows anything larger. */
const RESULT_LIMIT = 50

interface GraphSourcePickerProps {
  characterId: string | undefined
  onSelect: (characterId: string) => void
}

export function GraphSourcePicker({ characterId, onSelect }: GraphSourcePickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebouncedValue(search, 250)

  const params = characterDescriptor.listParamsSchema.parse({
    limit: RESULT_LIMIT,
    nameContains: debouncedSearch.trim() === "" ? undefined : debouncedSearch.trim(),
  })

  const query = useQuery({
    queryKey: characterDescriptor.keys.list(params),
    queryFn: ({ signal }) => characterDescriptor.resource.list(params, { signal }),
    // Only fetch while the picker is open — the graph workspace should not pay
    // for a character list it may never show.
    enabled: open,
    placeholderData: (previous) => previous,
  })

  const characters = query.data?.items ?? []
  const selected = characters.find((character) => character.id === characterId)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Choose a character"
          className="w-56 justify-between"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <UsersIcon className="size-3.5 shrink-0 text-entity-character" aria-hidden />
            <span className="truncate">
              {selected?.name ?? (characterId ? "Selected character" : "Choose a character…")}
            </span>
          </span>
          <ChevronsUpDownIcon className="size-3.5 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>

      <PopoverContent className="w-56 p-0" align="start">
        {/* Filtering is server-side via `name_contains`, so cmdk's own client
            filter is disabled — otherwise it would filter the filtered page. */}
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search characters…" value={search} onValueChange={setSearch} />
          <CommandList>
            {query.isPending ? (
              <div className="p-3 text-xs text-muted-foreground">Loading…</div>
            ) : query.isError ? (
              <div className="p-3 text-xs text-destructive">Could not load characters.</div>
            ) : (
              <>
                <CommandEmpty>No characters found.</CommandEmpty>
                <CommandGroup>
                  {characters.map((character) => (
                    <CommandItem
                      key={character.id}
                      value={character.id}
                      onSelect={() => {
                        onSelect(character.id)
                        setOpen(false)
                      }}
                    >
                      <CheckIcon
                        className={cn(
                          "size-3.5",
                          character.id === characterId ? "opacity-100" : "opacity-0",
                        )}
                        aria-hidden
                      />
                      <span className="truncate">{character.name}</span>
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
