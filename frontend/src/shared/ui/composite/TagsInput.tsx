import { XIcon } from "lucide-react"
import { useState } from "react"

import { cn } from "@/shared/lib/utils"
import { Badge } from "@/shared/ui/badge"
import { Input } from "@/shared/ui/input"

/**
 * A control for editing a list of short strings — Character aliases today, any
 * future string-list field tomorrow.
 *
 * It mirrors the backend's own normalization so what the user sees is what gets
 * stored: entries are trimmed, blanks rejected, and duplicates suppressed
 * **case-insensitively**, exactly as `CharacterBase.dedupe_aliases` does. Doing
 * this client-side means a silently-dropped duplicate never surprises the user
 * after a save.
 */

interface TagsInputProps {
  value: string[]
  onChange: (value: string[]) => void
  onBlur?: () => void
  id?: string
  placeholder?: string
  /** Hard cap, enforced by the backend (aliases: 10). */
  maxTags?: number
  maxTagLength?: number
  disabled?: boolean
  invalid?: boolean
  describedBy?: string
}

export function TagsInput({
  value,
  onChange,
  onBlur,
  id,
  placeholder = "Add and press Enter",
  maxTags,
  maxTagLength = 120,
  disabled = false,
  invalid = false,
  describedBy,
}: TagsInputProps) {
  const [draft, setDraft] = useState("")

  const isFull = maxTags !== undefined && value.length >= maxTags

  function addTag(raw: string) {
    const tag = raw.trim()
    if (tag === "" || isFull) return
    // Case-insensitive dedupe, matching the backend exactly.
    if (value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) {
      setDraft("")
      return
    }
    onChange([...value, tag.slice(0, maxTagLength)])
    setDraft("")
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        "flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background/60 p-1.5 transition-[color,box-shadow]",
        "focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50",
        invalid && "border-destructive ring-destructive/20",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {value.map((tag, index) => (
        <Badge key={`${tag}-${index}`} variant="secondary" className="gap-1 py-0.5 pr-0.5">
          <span className="max-w-40 truncate">{tag}</span>
          <button
            type="button"
            onClick={() => removeTag(index)}
            aria-label={`Remove ${tag}`}
            className="rounded-sm p-0.5 text-muted-foreground focus-ring transition-chrome hover:text-foreground"
          >
            <XIcon className="size-2.5" aria-hidden />
          </button>
        </Badge>
      ))}

      <Input
        id={id}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          // Commit a half-typed entry rather than silently discarding it.
          addTag(draft)
          onBlur?.()
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            // Enter must not submit the surrounding form while adding a tag.
            event.preventDefault()
            addTag(draft)
            return
          }
          if (event.key === "Backspace" && draft === "" && value.length > 0) {
            removeTag(value.length - 1)
          }
        }}
        placeholder={isFull ? `Maximum of ${maxTags ?? 0} reached` : placeholder}
        disabled={disabled || isFull}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        maxLength={maxTagLength}
        className="h-6 min-w-32 flex-1 border-0 bg-transparent px-1 focus-visible:border-0 focus-visible:ring-0"
      />
    </div>
  )
}
