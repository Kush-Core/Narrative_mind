import { SearchIcon, XIcon } from "lucide-react"
import { useEffect, useId, useRef, useState } from "react"

import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue"
import { cn } from "@/shared/lib/utils"
import { Button } from "@/shared/ui/button"
import { Input } from "@/shared/ui/input"

/**
 * Debounced search box for list surfaces.
 *
 * Holds the keystrokes locally so typing is instant, and reports upward only
 * once typing pauses — the committed value becomes a URL param and therefore a
 * request. Without the split, every keystroke would push a history entry and
 * fire a query.
 */

interface SearchInputProps {
  /** Committed value, owned by the URL. */
  value: string
  onValueChange: (value: string) => void
  placeholder?: string
  /** Accessible label; visually hidden. */
  label?: string
  debounceMs?: number
  className?: string
}

export function SearchInput({
  value,
  onValueChange,
  placeholder = "Search…",
  label = "Search",
  debounceMs = 300,
  className,
}: SearchInputProps) {
  const inputId = useId()
  const [draft, setDraft] = useState(value)
  const debounced = useDebouncedValue(draft, debounceMs)
  const inputRef = useRef<HTMLInputElement>(null)

  // Report the settled value upward, but never echo back what the parent
  // already has — that would fight the user mid-keystroke.
  const lastReported = useRef(value)
  useEffect(() => {
    if (debounced === lastReported.current) return
    lastReported.current = debounced
    onValueChange(debounced)
  }, [debounced, onValueChange])

  // Adopt external changes (back button, filter reset) without clobbering an
  // in-progress edit.
  useEffect(() => {
    if (value !== lastReported.current) {
      lastReported.current = value
      setDraft(value)
    }
  }, [value])

  return (
    <div className={cn("relative", className)}>
      <label htmlFor={inputId} className="sr-only">
        {label}
      </label>
      <SearchIcon
        className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        id={inputId}
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && draft !== "") {
            event.preventDefault()
            setDraft("")
          }
        }}
        className="pr-7 pl-8 [&::-webkit-search-cancel-button]:hidden"
      />
      {draft !== "" ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Clear search"
          onClick={() => {
            setDraft("")
            inputRef.current?.focus()
          }}
          className="absolute top-1/2 right-1 -translate-y-1/2"
        >
          <XIcon aria-hidden />
        </Button>
      ) : null}
    </div>
  )
}
